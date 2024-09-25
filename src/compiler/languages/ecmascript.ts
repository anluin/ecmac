import { ParseGenerator, Parser, token } from "../syntax_analysis.ts";

import {
    TokenKind,
    Character,
    Command,
    manyOf,
    string,
    TokenDecoderGenerator
} from "../lexical_analysis.ts";

// deno-lint-ignore no-control-regex
const isLineTerminator = (character: Character) => !!character && /[\u000A\u000D\u2028\u2029]/.test(character);
const isIdentifierStart = (character: Character) => !!character && /[$_\p{L}\u005C\u200C\u200D]/u.test(character);
const isIdentifierPart = (character: Character) => !!character && /[$_\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u.test(character);
const isWhitespace = (character: Character) => !!character && /[\t\v\f\u0020\u00A0\uFEFF\u2000-\u200F\u2028\u2029\u205F\u3000]/.test(character);

const doubleQuoteString = string('"', isLineTerminator);
const singleQuoteString = string("'", isLineTerminator);
const identifier = manyOf(isIdentifierStart, isIdentifierPart);
const lineTerminator = manyOf(isLineTerminator);
const whitespace = manyOf(isWhitespace);

function* punctuator(initialCharacter: Character): TokenDecoderGenerator<boolean> {
    switch (initialCharacter) {
        case '{':
        case '}':
        case '(':
        case ')':
        case '[':
        case ']':
        case '.':
        case ';':
        case ',':
        case '~':
        case '?':
        case ':':
            yield Command.Consume;
            return true;
        case '/':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '<':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                case '<':
                    yield Command.Consume;
                    switch (yield Command.Peek) {
                        case '=':
                            yield Command.Consume;
                            return true;
                        default:
                            return true;
                    }
                default:
                    return true;
            }
        case '>':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                case '>':
                    yield Command.Consume;
                    switch (yield Command.Peek) {
                        case '>':
                            yield Command.Consume;
                            switch (yield Command.Peek) {
                                case '=':
                                    yield Command.Consume;
                                    return true;
                                default:
                                    return true;
                            }
                        case '=':
                            yield Command.Consume;
                            return true;
                        default:
                            return true;
                    }
                default:
                    return true;
            }
        case '=':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    switch (yield Command.Peek) {
                        case '=':
                            yield Command.Consume;
                            return true;
                        default:
                            return true;
                    }
                default:
                    return true;
            }
        case '!':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    switch (yield Command.Peek) {
                        case '=':
                            yield Command.Consume;
                            return true;
                        default:
                            return true;
                    }
                default:
                    return true;
            }
        case '+':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '+':
                    yield Command.Consume;
                    return true;
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '-':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '-':
                    yield Command.Consume;
                    return true;
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '*':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '%':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '&':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '&':
                    yield Command.Consume;
                    return true;
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '|':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '|':
                    yield Command.Consume;
                    return true;
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        case '^':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '=':
                    yield Command.Consume;
                    return true;
                default:
                    return true;
            }
        default:
            return false;
    }
}

export function* tokenizer(initialCharacter: Character): TokenDecoderGenerator<TokenKind> {
    if (initialCharacter) {
        if (
            (yield* doubleQuoteString(initialCharacter)) ||
            (yield* singleQuoteString(initialCharacter))
        ) return TokenKind.String;

        if (yield* punctuator(initialCharacter)) return TokenKind.Punctuator;
        if (yield* lineTerminator(initialCharacter)) return TokenKind.LineTerminator;
        if (yield* whitespace(initialCharacter)) return TokenKind.Whitespace;
        if (yield* identifier(initialCharacter)) return TokenKind.Identifier;
    }

    yield Command.Consume;
    return TokenKind.Unknown;
}

export class Statement {
    static* parse(): ParseGenerator<InstanceType<typeof this>> {
        yield* token(TokenKind.Identifier);

        return new Statement();
    }
}

export class Module {
    constructor(
        readonly sourceUrl: URL,
        readonly statements: Statement[],
    ) {
    }

    static async load(sourceUrl: URL) {
        const statements: Statement[] = [];

        for await (const statement of (
            new Parser(Statement)
                .parse({
                    sourceUrl,
                    tokenizer,
                })
        )) {
            statements.push(statement);
            break;
        }

        return new this(sourceUrl, statements);
    }
}