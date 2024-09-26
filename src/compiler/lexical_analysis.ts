// noinspection JSUnusedGlobalSymbols

import { encodeBase64Url } from "@std/encoding";
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

export const enum TokenKind {
    End = 1 << 1,
    Integer = 1 << 2,
    Float = 1 << 3,
    String = 1 << 4,
    Number = TokenKind.Integer | TokenKind.Float,
    Literal = TokenKind.Number | TokenKind.String,
    Whitespace = 1 << 5,
    Punctuator = 1 << 6,
    Identifier = 1 << 7,
    LineComment = 1 << 8,
    BlockComment = 1 << 9,
    Comment = TokenKind.LineComment | TokenKind.BlockComment,
    Template = 1 << 10,
    TemplateHead = 1 << 11,
    TemplateMiddle = 1 << 12,
    TemplateTail = 1 << 13,
    RegExp = 1 << 14,
    LineTerminator = 1 << 15,
    Unknown = 1 << 16,
}

export const stringifyTokenKind = (kind: TokenKind) => {
    switch (kind) {
        case TokenKind.End:
            return "End";
        case TokenKind.Integer:
            return "Integer";
        case TokenKind.Float:
            return "Float";
        case TokenKind.String:
            return "String";
        case TokenKind.Number:
            return "Number";
        case TokenKind.Literal:
            return "Literal";
        case TokenKind.Whitespace:
            return "Whitespace";
        case TokenKind.Punctuator:
            return "Punctuator";
        case TokenKind.Identifier:
            return "Identifier";
        case TokenKind.LineComment:
            return "LineComment";
        case TokenKind.BlockComment:
            return "BlockComment";
        case TokenKind.Comment:
            return "Comment";
        case TokenKind.Template:
            return "Template";
        case TokenKind.TemplateHead:
            return "TemplateHead";
        case TokenKind.TemplateMiddle:
            return "TemplateMiddle";
        case TokenKind.TemplateTail:
            return "TemplateTail";
        case TokenKind.RegExp:
            return "RegExp";
        case TokenKind.LineTerminator:
            return "LineTerminator";
        case TokenKind.Unknown:
            return "Unknown";
        default:
            throw new Error("Invalid TokenKind");
    }
}

export class Token<Payload extends string = string> {
    constructor(
        readonly kind: TokenKind,
        readonly payload: Payload,
        readonly span: Span,
    ) {
    }

    [Symbol.for("Deno.customInspect")]() {
        return `${this.span.sourceUrl.href}:${this.span.begin.line + 1}:${this.span.begin.column + 1}: ${JSON.stringify(this.payload)} (${stringifyTokenKind(this.kind)})`;
    }
}

export function resolveSourceUrl(source: string | URL): URL;
export function resolveSourceUrl(source: `${'/' | './'}${string}`): URL;
export function resolveSourceUrl(source: `${"file" | "http" | "https"}://${string}` | URL): URL;
export function resolveSourceUrl(source: string | URL) {
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

export type Character = string | null;

export const enum Command {
    Peek,
    Consume,
}

export type TokenParserGenerator<T> = Generator<Command, T, Character>;
export type TokenizerFn = (initialCharacter: Character) => TokenParserGenerator<TokenKind>;
export type TokenizerFnComponent<T = boolean> = { (initialCharacter: Character): TokenParserGenerator<T> };

export const utils = {
    manyOf<T extends TokenKind | void = void>(partOrStart: (character: Character) => boolean, optionalPart?: (character: Character) => boolean, tokenKind?: T) {
        return function* (initialCharacter) {
            if (partOrStart(initialCharacter)) {
                do {
                    yield Command.Consume;
                } while ((optionalPart ?? partOrStart)(yield Command.Peek))

                return tokenKind ?? true;
            }

            return tokenKind ?? false;
        } as TokenizerFnComponent<T extends TokenKind ? TokenKind : boolean>;
    },
    string(indicator: string, isLineTerminator: (character: Character) => boolean): TokenizerFnComponent {
        return function* (initialCharacter) {
            if (initialCharacter === indicator) {
                yield Command.Consume;

                for (; ;) {
                    const character = yield Command.Peek;

                    if (isLineTerminator(character)) {
                        throw new Error("Unclosed string literal");
                    }

                    yield Command.Consume;

                    if (character === indicator) {
                        break;
                    }
                }

                return true;
            }

            return false;
        };
    },
} as const;

export type TokenParserOptions = {
    tokenizer: TokenizerFn,
    sourceUrl: URL,
};

export type TokenParserParseOptions = {
    stream?: boolean,
};

export class TokenParser {
    readonly #generatorFunction: TokenizerFn;
    readonly sourceUrl: URL;

    #position = 0;
    #column = 0;
    #line = 0;

    #state?: {
        generator: TokenParserGenerator<TokenKind>,
        result: IteratorResult<Command>,
        begin: Cursor,
        payload: string,
    };

    constructor(options: TokenParserOptions) {
        this.#generatorFunction = options.tokenizer;
        this.sourceUrl = options.sourceUrl;
    }

    * parse(sourceCode: string, options?: TokenParserParseOptions) {
        const length = sourceCode.length + +(options?.stream !== true);

        for (let index = 0; index < length; index++) {
            const character = sourceCode[index] ?? null;

            let command = Command.Peek;

            while (command !== Command.Consume) {
                if (character === null && !this.#state) {
                    break;
                }

                if (!this.#state) {
                    const generator = this.#generatorFunction(character);
                    const begin = new Cursor(this.#position, this.#column, this.#line);
                    const result = generator.next();
                    const payload = "";

                    this.#state = {
                        generator,
                        payload,
                        result,
                        begin,
                    };
                }

                if (this.#state.result.done) {
                    yield new Token(
                        this.#state.result.value,
                        this.#state.payload,
                        new Span(
                            this.sourceUrl,
                            this.#state.begin,
                            new Cursor(
                                this.#position,
                                this.#column,
                                this.#line,
                            ),
                        ),
                    );

                    this.#state = undefined;
                } else {
                    command = this.#state.result.value;

                    if (command === Command.Consume) {
                        this.#state.payload += character;
                    }

                    this.#state.result = this.#state.generator.next(character);
                }
            }

            if (character !== "\n") {
                this.#column += 1;
            } else {
                this.#column = 0;
                this.#line += 1;
            }

            this.#position += 1;
        }

        if (options?.stream === true) {
            this.#position = 0;
            this.#column = 0;
            this.#line = 0;
        }
    }
}

export class TokenParserStream extends TransformStream<string, Token[]> {
    constructor(
        options: TokenParserOptions,
        writableStrategy?: QueuingStrategy<string>,
        readableStrategy?: QueuingStrategy<Token[]>,
    ) {
        const process = ((
            tokenParser = new TokenParser(options),
            previousString?: string
        ) => (
            (controller: TransformStreamDefaultController<Token[]>, string?: string) => {
                if (previousString) {
                    const options = {stream: string !== undefined};
                    const tokens = Array.from(
                        tokenParser.parse(previousString, options),
                    );

                    if (tokens.length > 0) {
                        controller.enqueue(tokens);
                    }
                }

                previousString = string;
            }
        ))();

        super(
            <Transformer<string, Token[]>>{
                transform: (chunk, controller) =>
                    process(controller, chunk),
                flush: (controller) =>
                    process(controller),
            },
            writableStrategy,
            readableStrategy,
        );
    }
}

export async function* tokenize(options: TokenParserOptions) {
    for await (const chunk of await (
        fetch(options.sourceUrl)
            .then(response => (
                (response.body ?? ReadableStream.from([]))
                    .pipeThrough(new TextDecoderStream())
                    .pipeThrough(new TokenParserStream(options))
            ))
    )) {
        yield* chunk;
    }
}
