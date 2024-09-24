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

export function resolveSource(source: string | URL): URL;
export function resolveSource(source: `${'/' | './'}${string}`): URL;
export function resolveSource(source: `${"file" | "http" | "https"}://${string}` | URL): URL;
export function resolveSource(source: string | URL) {
    return (
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
    )
}

export type TokenDecoderOptions = {
    sourceUrl: URL,
    stream?: boolean,
};

export class TokenDecoder {
    static #defaultRegExps: [ TokenType, RegExp ][] = [
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

    static #templateLiteralRegExps: [ TokenType, RegExp ][] = [
        [ TokenType.TemplateLiteralMiddle, /^\}(?:(?!\$\{)[^`\\]|\\.)*\$\{/ ],
        [ TokenType.TemplateLiteralEnd, /^\}(?:(?!\$\{)[^`\\]|\\.)*`/ ],
        ...TokenDecoder.#defaultRegExps,
    ];

    static #regExpsTransition = new Map<TokenType, [ TokenType, RegExp ][]>([
        [ TokenType.TemplateLiteralStart, this.#templateLiteralRegExps ],
        [ TokenType.TemplateLiteralMiddle, this.#templateLiteralRegExps ],
        [ TokenType.TemplateLiteralEnd, this.#defaultRegExps ],
    ]);

    #activeRegExps: [ TokenType, RegExp ][];

    position = 0;
    column = 0;
    line = 0;

    constructor() {
        this.#activeRegExps = TokenDecoder.#defaultRegExps;
    }

    * decode(sourceCode: string, options: TokenDecoderOptions) {
        outerLoop:
            for (let index = 0; index < sourceCode.length;) {
                const sourceCodeView = sourceCode.substring(index);
                const begin = new Cursor(this.position, this.column, this.line);

                for (const [ type, regExp ] of this.#activeRegExps) {
                    const result = regExp.exec(sourceCodeView);

                    if (result) {
                        const payload = result[0];

                        for (const character of payload) {
                            if (character === "\n") {
                                this.column = 0;
                                this.line += 1;
                            } else {
                                this.column += 1;
                            }

                            index += 1;
                        }

                        this.position += payload.length;

                        const end = new Cursor(this.position, this.column, this.line);
                        const span = new Span(options.sourceUrl, begin, end);

                        yield new Token(type, payload, span);

                        this.#activeRegExps = (
                            TokenDecoder.#regExpsTransition.get(type) ??
                            this.#activeRegExps
                        );

                        continue outerLoop;
                    }
                }

                throw new Error(`${options.sourceUrl}:${begin.line}:${begin.column} unexpected character: ${JSON.stringify(sourceCode[index])}`);
            }
    }
}

export class TokenDecoderStream extends TransformStream<Uint8Array, Token> {
    static #regExp = /^(?<sourceCode>(?:(?:(?!(?:\r?\n|\u2028|\u2029)).)*(?:\r?\n|\u2028|\u2029))+)(?<restBuffer>.*(\r?\n|\u2028|\u2029)?)$/usm;

    readonly #textDecoder = new TextDecoder();
    readonly #tokenDecoder = new TokenDecoder();

    constructor(
        readonly sourceUrl: URL,
        writableStrategy?: QueuingStrategy<Uint8Array>,
        readableStrategy?: QueuingStrategy<Token>,
    ) {
        let buffer = "";

        const tokenDecoderOptions: TokenDecoderOptions = {sourceUrl, stream: true};
        const transformer: Transformer<Uint8Array, Token> = {
            transform: (chunk, controller) => {
                const match: RegExpMatchArray | null = (
                    TokenDecoderStream.#regExp
                        .exec(buffer += (
                            this.#textDecoder.decode(chunk, {
                                stream: true,
                            })
                        ))
                );

                if (match?.groups) {
                    const {sourceCode, restBuffer} = match.groups;

                    for (const token of this.#tokenDecoder.decode(sourceCode, tokenDecoderOptions)) {
                        controller.enqueue(token);
                    }

                    buffer = restBuffer;
                }
            },
            flush: (controller) => {
                for (const token of this.#tokenDecoder.decode(buffer, tokenDecoderOptions)) {
                    controller.enqueue(token);
                }
            },
        };

        super(transformer, writableStrategy, readableStrategy);
    }
}
