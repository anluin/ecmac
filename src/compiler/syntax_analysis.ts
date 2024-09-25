// deno-lint-ignore-file no-explicit-any
// noinspection JSUnusedGlobalSymbols

import { Token, TokenDecoderOptions, tokenize, Tokenizer, TokenKind } from "./lexical_analysis.ts";

export const enum ParseCommandKind {
    Peek,
    Eat,
    Cursor,
}

export type PeekParseCommand = {
    kind: ParseCommandKind.Peek;
};

export type PeekParseCommandResult = {
    kind: ParseCommandKind.Peek;
    result: Token;
};

export type EatParseCommand = {
    kind: ParseCommandKind.Eat;
};

export type EatParseCommandResult = {
    kind: ParseCommandKind.Eat;
    result: Token;
};

export type CursorParseCommand = {
    kind: ParseCommandKind.Cursor;
    data?: number;
};

export type CursorParseCommandResult = {
    kind: ParseCommandKind.Cursor;
    result: number;
};

export type ParseCommand =
    | PeekParseCommand
    | EatParseCommand
    | CursorParseCommand;

export type ParseCommandResult =
    | PeekParseCommandResult
    | EatParseCommandResult
    | CursorParseCommandResult;

export type ParseGenerator<T> = Generator<ParseCommand, T, ParseCommandResult>;

export interface ParseTrait<T, Args extends Array<unknown> = []> {
    parse(...args: Args): ParseGenerator<T>;
}

export class EndOfStream extends Error {
}

export class Parser<T> {
    readonly #parseable: ParseTrait<T>;

    constructor(parseable: ParseTrait<T>) {
        this.#parseable = parseable;
    }

    async* parse(options: TokenDecoderOptions) {
        const fetchNextToken = (
            (tokenStream?: AsyncGenerator<Token, void, undefined>) => async () => {
                const result = await (tokenStream ??= tokenize(options)).next();
                if (result.done) throw new EndOfStream();
                return result.value;
            }
        )();

        try {
            // noinspection JSMismatchedCollectionQueryUpdate
            const tokens: Token[] = [];
            let cursor = 0;

            for (; ;) {
                const generator = this.#parseable.parse();
                let result = generator.next();

                while (!result.done) {
                    const command = result.value;

                    switch (command.kind) {
                        case ParseCommandKind.Peek:
                            result = generator.next({
                                kind: command.kind,
                                result: tokens[cursor] ??= await fetchNextToken(),
                            });

                            break;
                        case ParseCommandKind.Eat:
                            result = generator.next({
                                kind: command.kind,
                                result: tokens[cursor++] ??= await fetchNextToken(),
                            });

                            break;
                        case ParseCommandKind.Cursor:
                            result = generator.next({
                                kind: command.kind,
                                result: cursor,
                            });

                            cursor = command.data ?? cursor;

                            break;
                    }
                }

                yield result.value;
            }
        } catch (error) {
            if (error instanceof EndOfStream) return;
            throw error;
        }
    }
}

export function* peek(): ParseGenerator<Token> {
    const request = {kind: ParseCommandKind.Peek} as const;
    const response = yield request;

    if (response.kind !== request.kind) {
        throw new Error();
    }

    return response.result;
}

export function* eat(): ParseGenerator<Token> {
    const request = {kind: ParseCommandKind.Eat} as const;
    const response = yield request;

    if (response.kind !== request.kind) {
        throw new Error();
    }

    return response.result;
}

export function* cursor(data?: number): ParseGenerator<number> {
    const request = {kind: ParseCommandKind.Cursor, data} as const;
    const response = yield request;

    if (response.kind !== request.kind) {
        throw new Error();
    }

    return response.result;
}

type StringToNumberMap = {
    "0": 0;
    "1": 1;
    "2": 2;
    "3": 3;
    "4": 4;
    "5": 5;
    "6": 6;
    "7": 7;
    "8": 8;
    "9": 9;
};

export type AsNumber<T extends string> = T extends keyof StringToNumberMap ? StringToNumberMap[T]
    : T extends `${infer First}${infer Rest}`
        ? First extends keyof StringToNumberMap
            ? `${StringToNumberMap[First]}` extends `${infer DigitString}` ? Rest extends "" ? StringToNumberMap[First]
                    : `${DigitString}${AsNumber<Rest>}`
                : never
            : never
        : never;

export function* choiceWithIndices<T extends ParseGenerator<any>[]>(
    ...parseGenerators: T
): ParseGenerator<
    {
        [K in keyof T]: T[K] extends ParseGenerator<infer I> ? {
            index: K extends `${number}` ? AsNumber<K> : number;
            position: number;
            value: I;
        }
        : never;
    }[number]
> {
    if (parseGenerators.length === 0) {
        throw new Error("at least one ParseGenerator required");
    }

    const initialPosition = yield* cursor();

    let furthestResult:
        | (
        & { position: number; index: number }
        & (
        | {
        value: T[number] extends ParseGenerator<infer I> ? I
            : never;
    }
        | { error: unknown }
        )
        )
        | undefined = undefined;

    for (let index = 0; index < parseGenerators.length; index++) {
        try {
            const value = yield* parseGenerators[index];
            const position = yield* cursor(initialPosition);

            if (
                furthestResult === undefined ||
                furthestResult.position < position ||
                "error" in furthestResult
            ) {
                furthestResult = {
                    position,
                    index,
                    value,
                };
            }
        } catch (error) {
            const position = yield* cursor(initialPosition);

            if (error instanceof FatalError) {
                throw error;
            }

            if (
                furthestResult === undefined ||
                furthestResult.position < position
            ) {
                furthestResult = {
                    position,
                    index,
                    error,
                };
            }
        }
    }

    if (!furthestResult) {
        throw new Error("something went wrong");
    }

    yield* cursor(furthestResult.position);

    if ("error" in furthestResult) {
        throw furthestResult.error;
    }

    return furthestResult as any;
}

export function* choice<T extends ParseGenerator<any>[]>(
    ...parseGenerators: T
) {
    return (yield* choiceWithIndices(...parseGenerators))
        .value as T[number] extends ParseGenerator<infer I> ? I : never;
}

export function* firstChoiceWithIndices<T extends ParseGenerator<any>[]>(
    ...parseGenerators: T
): ParseGenerator<
    {
        [K in keyof T]: T[K] extends ParseGenerator<infer I> ? {
            index: K extends `${number}` ? AsNumber<K> : number;
            position: number;
            value: I;
        }
        : never;
    }[number]
> {
    if (parseGenerators.length === 0) {
        throw new Error("at least one ParseGenerator required");
    }

    const initialPosition = yield* cursor();

    let furthestResult:
        | (
        & { position: number; index: number }
        & (
        | {
        value: T[number] extends ParseGenerator<infer I> ? I
            : never;
    }
        | { error: unknown }
        )
        )
        | undefined = undefined;

    for (let index = 0; index < parseGenerators.length; index++) {
        try {
            const value = yield* parseGenerators[index];
            const position = yield* cursor(initialPosition);

            if (
                furthestResult === undefined ||
                furthestResult.position < position ||
                "error" in furthestResult
            ) {
                yield* cursor(position);

                return {
                    position,
                    index,
                    value,
                } as any;
            }
        } catch (error) {
            const position = yield* cursor(initialPosition);

            if (error instanceof FatalError) {
                throw error;
            }

            if (
                furthestResult === undefined ||
                furthestResult.position < position
            ) {
                furthestResult = {
                    position,
                    index,
                    error,
                };
            }
        }
    }

    if (!furthestResult) {
        throw new Error("something went wrong");
    }

    // noinspection BadExpressionStatementJS
    yield* cursor(furthestResult.position);

    if ("error" in furthestResult) {
        throw furthestResult.error;
    }

    return furthestResult as any;
}

export function* firstChoice<T extends ParseGenerator<any>[]>(
    ...parseGenerators: T
) {
    return (yield* firstChoiceWithIndices(...parseGenerators))
        .value as T[number] extends ParseGenerator<infer I> ? I : never;
}

export class FatalError<T> {
    readonly error: T;

    constructor(error: T) {
        this.error = error;
    }
}

export function* fatal<T>(parseGenerator: ParseGenerator<T>) {
    try {
        return yield* parseGenerator;
    } catch (error) {
        if (error instanceof FatalError) {
            throw error;
        }

        throw new FatalError(error);
    }
}

export function* maybe<T>(parseGenerator: ParseGenerator<T>) {
    const initialPosition = yield* cursor();

    try {
        return yield* parseGenerator;
    } catch (error) {
        yield* cursor(initialPosition);

        if (error instanceof FatalError) {
            throw error.error;
        }

        return undefined;
    }
}

export function* lookAHead<T>(parseGenerator: ParseGenerator<T>) {
    const initialPosition = yield* cursor();

    try {
        return {
            result: yield* parseGenerator,
            position: yield* cursor(initialPosition),
        };
    } catch (error) {
        yield* cursor(initialPosition);

        if (error instanceof FatalError) {
            throw error.error;
        }

        throw error;
    }
}

export function* token<Payload extends string = string>(
    kind: TokenKind,
    payload?: Payload,
): ParseGenerator<Token<Payload>> {
    const token = yield* peek();

    if (
        (token.kind & kind) > 0 &&
        (payload === undefined || token.payload === payload)
    ) {
        return (yield* eat()) as Token<Payload>;
    }

    throw new Error(`unexpected token: ${Deno.inspect(token)}`);
}
