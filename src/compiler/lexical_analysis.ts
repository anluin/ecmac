// deno-lint-ignore-file no-control-regex

import { encodeBase64Url } from "@std/encoding/base64url";
import { resolve, toFileUrl } from "@std/path";

export class Cursor {
    constructor(
        readonly position: number,
        readonly column: number,
        readonly line: number,
    ) {
    }
}

export class Span {
    constructor(
        readonly sourceUrl: URL,
        readonly begin: Cursor,
        readonly end: Cursor,
    ) {
        Object.defineProperty(this, 'sourceUrl', {enumerable: false});
    }
}

export enum TokenType {
    Unknown,
    Identifier,
    Number,
    Punctuator,
    String,
    RegExp,
    Comment,
    LineTerminator,
    Whitespace,
    TemplateLiteral,
    TemplateLiteralStart,
    TemplateLiteralMiddle,
    TemplateLiteralEnd,
}

export class Token {
    constructor(
        readonly type: TokenType,
        readonly payload: string,
        readonly span: Span,
    ) {
    }

    [Symbol.for("Deno.customInspect")]() {
        return `${this.span.sourceUrl.href}:${this.span.begin.line + 1}:${this.span.begin.column + 1}: ${JSON.stringify(this.payload)} (${TokenType[this.type]})`;
    }
}

export function tokenize(source: string): AsyncGenerator<Token>;
export function tokenize(source: `${'/' | './'}${string}`): AsyncGenerator<Token>;
export function tokenize(source: `${"file" | "http" | "https"}://${string}` | URL): AsyncGenerator<Token>;
export async function* tokenize(source: string | URL) {
    const
        sourceUrl = (
            source instanceof URL
                ? source
                : /^\.?\//m.test(source)
                    ? toFileUrl(resolve(source))
                    : /^(file|https?):\/{2}/m.test(source)
                        ? new URL(source)
                        : new URL(
                            `data:application/javascript;base64,${
                                encodeBase64Url(source)
                            }`,
                        )
        ),
        sourceCode = await (
            fetch(sourceUrl)
                .then(response => response.text())
        );

    const defaultRegExps: [ TokenType, RegExp ][] = [
        [ TokenType.Comment, /^((?:\/\/[^\n]*\n?)|(?:\/[^\n]*$|\/(?!\\)\*[\s\S]*?\*(?!\\)\/))/ ],
        [ TokenType.String, /^(("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*'))/ ],
        [ TokenType.TemplateLiteral, /^`(?:(?!\$\{)[^`\\]|\\.)*`/ ],
        [ TokenType.TemplateLiteralStart, /^`(?:(?!\$\{)[^`\\]|\\.)*\$\{/ ],
        [ TokenType.Number, /^(0|(?:[1-9][0-9]*))/ ],
        [ TokenType.RegExp, /^(\/(?:(?:\[\^[^\]]+\])|(?:[^\/\\])|\\.)*\/[a-z]*)/ ],
        [ TokenType.Identifier, /^([_$\p{L}][_$\p{L}\p{M}\p{N}\p{Pc}]*)/u ],
        [ TokenType.Punctuator, /^(\/=?|={1,3}|!(?:==?)?|%=?|&[&=]?|\*=?|\+[+=]?|-[-=]?|<{1,2}=?|>{1,3}=?|\^=?|\|[|=]?|[(),.;:[\]{}~]|\?(\?=?)?)/ ],
        [ TokenType.Whitespace, /^([\u0009\u000B\u000C\u0020\u00A0\uFEFF]+)/u ],
        [ TokenType.LineTerminator, /^(\r?\n|\u2028|\u2029)/u ],
        [ TokenType.Unknown, /^./ ],
    ];

    const templateLiteralRegExps: [ TokenType, RegExp ][] = [
        [ TokenType.TemplateLiteralMiddle, /^\}(?:(?!\$\{)[^`\\]|\\.)*\$\{/ ],
        [ TokenType.TemplateLiteralEnd, /^\}(?:(?!\$\{)[^`\\]|\\.)*`/ ],
        ...defaultRegExps,
    ];

    const regExpsTransition = new Map<TokenType, [ TokenType, RegExp ][]>([
        [ TokenType.TemplateLiteralStart, templateLiteralRegExps ],
        [ TokenType.TemplateLiteralMiddle, templateLiteralRegExps ],
        [ TokenType.TemplateLiteralEnd, defaultRegExps ],
    ]);

    let activeRegExps: [ TokenType, RegExp ][] = defaultRegExps;

    outerLoop:
        for (
            let
                position = 0,
                column = 0,
                line = 0;
            position < sourceCode.length;
        ) {
            const sourceCodeView = sourceCode.substring(position);
            const begin = new Cursor(position, column, line);

            for (const [ type, regExp ] of activeRegExps) {
                const result = regExp.exec(sourceCodeView);

                if (result) {
                    const payload = result[0];

                    for (const character of payload) {
                        if (character !== "\n") {
                            column += 1;
                        } else {
                            column = 0;
                            line += 1;
                        }
                    }

                    position += payload.length;

                    const end = new Cursor(position, column, line);
                    const span = new Span(sourceUrl, begin, end);

                    yield new Token(type, payload, span);

                    activeRegExps = regExpsTransition.get(type) ?? activeRegExps;

                    continue outerLoop;
                }
            }

            throw new Error(`${sourceUrl}:${begin.line}:${begin.column} unexpected character: ${JSON.stringify(sourceCode[position])}`);
        }
}
