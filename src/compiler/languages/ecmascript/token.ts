import { ParserStream, ParserStreamGenerator } from "../../parser.ts";
import { CodePoint, Span } from "../../code_point.ts";


export abstract class Token<Payload extends string = string> {
    readonly payload: Payload;
    readonly span: Span;

    constructor(
        ...codePoints: CodePoint[]
    ) {
        this.payload = String.fromCodePoint(
            ...codePoints.map(codePoint => +codePoint),
        ) as Payload;

        this.span = Span.around(
            codePoints[0].span,
            codePoints.at(-1)?.span,
        );
    }

    static* parse(): ParserStreamGenerator<CodePoint, Token> {
        const initialCodePoint = yield* ParserStream.consume();

        return (
            (yield* lineTerminator(initialCodePoint)) ??
            (yield* whitespace(initialCodePoint)) ??
            (yield* punctuator(initialCodePoint)) ??
            (yield* identifier(initialCodePoint)) ??
            (yield* string(initialCodePoint)) ??
            (yield* unknown(initialCodePoint))
        );
    }

    static* consume<Payload extends string = string>(payload?: Payload) {
        const token = yield* ParserStream.peek<Token>();

        if (token instanceof this && (payload === undefined || token.payload === payload)) {
            return (yield* ParserStream.consume<Token>()) as Token<Payload>;
        }

        throw new Error(`reached unexpected token: ${Deno.inspect(token)}`);
    }
}

export class UnknownToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as UnknownToken<Payload>;
    }
}

export class IdentifierToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as IdentifierToken<Payload>;
    }
}

export class StringToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as StringToken<Payload>;
    }
}

export class LineTerminatorToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as LineTerminatorToken<Payload>;
    }
}

export class WhitespaceToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as WhitespaceToken<Payload>;
    }
}

export class PunctuatorToken<Payload extends string = string> extends Token<Payload> {
    static* consume<Payload extends string = string>(payload?: Payload) {
        return (yield* super.consume(payload)) as PunctuatorToken<Payload>;
    }
}

// TODO: Evaluate the use of a const enum
// https://en.wikipedia.org/wiki/List_of_Unicode_characters
const isQuotationMark = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 34);
const isApostrophe = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 39);
const isLineFeed = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 10);
const isCarriageReturn = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 13);
const isDollarSign = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 36);
const isLowLine = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 95);
const isFullStop = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 46);
const isLeftParenthesis = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 40);
const isRightParenthesis = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 41);
const isSemicolon = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 59);
const isComma = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 44);
const isSpace = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (+codePoint === 32);

const isWhitespace = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (
    isSpace(codePoint) ||
    +codePoint === 9
);

const isDigit = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (
    (+codePoint >= 48 && +codePoint <= 57) // 0-9
);

const isAlphabet = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (
    (+codePoint >= 65 && +codePoint <= 90) || // A-Z
    (+codePoint >= 97 && +codePoint <= 122)   // a-z
);

const isIdentifierStart = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (
    isDollarSign(codePoint) ||
    isAlphabet(codePoint) ||
    isLowLine(codePoint)
);

const isIdentifierPart = (codePoint: CodePoint | null): codePoint is CodePoint => !!codePoint && (
    isIdentifierStart(codePoint) ||
    isDigit(codePoint)
);


// deno-lint-ignore require-yield
function* punctuator(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token | null> {
    if (
        isComma(initialCodePoint) ||
        isFullStop(initialCodePoint) ||
        isSemicolon(initialCodePoint) ||
        isLeftParenthesis(initialCodePoint) ||
        isRightParenthesis(initialCodePoint)
    ) {
        return new PunctuatorToken(
            initialCodePoint,
        );
    }

    return null;
}

function* whitespace(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token | null> {
    if (isWhitespace(initialCodePoint)) {
        const codePoints: CodePoint[] = [
            initialCodePoint,
        ];

        while (isWhitespace(yield* ParserStream.tryPeek())) {
            codePoints.push(yield* ParserStream.consume());
        }

        return new WhitespaceToken(...codePoints);
    }

    return null;
}

function* lineTerminator(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token | null> {
    if (isCarriageReturn(initialCodePoint)) {
        const cursor = yield* ParserStream.position();
        const codePoint = yield* ParserStream.tryConsume();

        if (isLineFeed(codePoint)) {
            return new LineTerminatorToken(initialCodePoint, codePoint);
        }

        yield* ParserStream.position(cursor);
    }

    if (isLineFeed(initialCodePoint)) {
        return new LineTerminatorToken(initialCodePoint);
    }

    return null;
}

function* string(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token | null> {
    if (isQuotationMark(initialCodePoint) || isApostrophe(initialCodePoint)) {
        const codePoints: CodePoint[] = [
            initialCodePoint,
        ];

        for (; ;) {
            const codePoint = yield* ParserStream.tryConsume();

            if (isLineFeed(codePoint) || codePoint === null) {
                throw new Error("Unclosed string literal");
            }

            codePoints.push(codePoint);

            if (+codePoint === +initialCodePoint) {
                break;
            }
        }

        return new StringToken(...codePoints);
    }

    return null;
}

function* identifier(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token | null> {
    if (isIdentifierStart(initialCodePoint)) {
        const codePoints: CodePoint[] = [
            initialCodePoint,
        ];

        while (isIdentifierPart(yield* ParserStream.tryPeek())) {
            codePoints.push(yield* ParserStream.consume());
        }

        return new IdentifierToken(...codePoints);
    }

    return null;
}

// deno-lint-ignore require-yield
function* unknown(initialCodePoint: CodePoint): ParserStreamGenerator<CodePoint, Token> {
    return new UnknownToken(initialCodePoint);
}
