// deno-lint-ignore-file no-control-regex

import { TokenKind, Character, Command, TokenParserGenerator } from "../../lexical_analysis.ts";
import { utils as lexicalAnalysisUtils } from "../../lexical_analysis.ts";

const isWhitespace = (character: Character) => !!character && /[\t\v\f\u0020\u00A0\uFEFF\u2000-\u200F\u2028\u2029\u205F\u3000]/.test(character);
const isIdentifierPart = (character: Character) => !!character && /[$_\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u.test(character);
const isIdentifierStart = (character: Character) => !!character && /[$_\p{L}\u005C\u200C\u200D]/u.test(character);
const isLineTerminator = (character: Character) => !!character && /[\u000A\u000D\u2028\u2029]/.test(character);

const doubleQuoteString = lexicalAnalysisUtils.string('"', isLineTerminator);
const singleQuoteString = lexicalAnalysisUtils.string("'", isLineTerminator);
const identifier = lexicalAnalysisUtils.manyOf(isIdentifierStart, isIdentifierPart);
const lineTerminator = lexicalAnalysisUtils.manyOf(isLineTerminator);
const whitespace = lexicalAnalysisUtils.manyOf(isWhitespace);

function* punctuator(initialCharacter: Character): TokenParserGenerator<boolean> {
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

function* divPunctuatorOrLineComment(initialCharacter: Character): TokenParserGenerator<TokenKind | void> {
    switch (initialCharacter) {
        case '/':
            yield Command.Consume;
            switch (yield Command.Peek) {
                case '/':
                    yield Command.Consume;

                    while (!isLineTerminator(yield Command.Peek)) {
                        yield Command.Consume;
                    }

                    return TokenKind.LineComment;
                case '=':
                    yield Command.Consume;
                    return TokenKind.Punctuator;
                default:
                    return TokenKind.Punctuator;
            }
    }
}

function* unknown(): TokenParserGenerator<TokenKind> {
    yield Command.Consume;
    return TokenKind.Unknown;
}

export function* tokenizer(initialCharacter: Character): TokenParserGenerator<TokenKind> {
    if (initialCharacter) {
        if (
            (yield* doubleQuoteString(initialCharacter)) ||
            (yield* singleQuoteString(initialCharacter))
        ) {
            return TokenKind.String;
        }

        if (yield* punctuator(initialCharacter))
            return TokenKind.Punctuator;

        if (yield* whitespace(initialCharacter))
            return TokenKind.Whitespace;

        if (yield* identifier(initialCharacter))
            return TokenKind.Identifier;

        if (yield* lineTerminator(initialCharacter))
            return TokenKind.LineTerminator;
    }

    return (
        (yield* divPunctuatorOrLineComment(initialCharacter)) ??
        (yield* unknown())
    );
}
