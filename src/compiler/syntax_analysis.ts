// deno-lint-ignore-file no-explicit-any
// noinspection JSUnusedGlobalSymbols

import { stringifyTokenKind, Token, TokenKind } from "./lexical_analysis.ts";

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

type AsNumber<T extends string> = T extends keyof StringToNumberMap ? StringToNumberMap[T]
    : T extends `${infer First}${infer Rest}`
        ? First extends keyof StringToNumberMap
            ? `${StringToNumberMap[First]}` extends `${infer DigitString}` ? Rest extends "" ? StringToNumberMap[First]
                    : `${DigitString}${AsNumber<Rest>}`
                : never
            : never
        : never;

export const enum CommandKind {
    Peek,
    Consume,
    Cursor,
}

export type PeekCommand = {
    kind: CommandKind.Peek;
};

export type PeekCommandResult = {
    kind: CommandKind.Peek;
    result: Token | null;
};

export type ConsumeCommand = {
    kind: CommandKind.Consume;
};

export type ConsumeCommandResult = {
    kind: CommandKind.Consume;
    result: Token | null;
};

export type CursorCommand = {
    kind: CommandKind.Cursor;
    data?: number;
};

export type CursorCommandResult = {
    kind: CommandKind.Cursor;
    result: number;
};

export type Command =
    | PeekCommand
    | ConsumeCommand
    | CursorCommand;

export type CommandResult =
    | PeekCommandResult
    | ConsumeCommandResult
    | CursorCommandResult;

export type SyntaxParserGenerator<T> = Generator<Command, T, CommandResult>;

export interface Parseable<T, Args extends Array<unknown> = []> {
    parse(...args: Args): SyntaxParserGenerator<T>;
}

export type SyntaxParserOptions<T> = {
    parseable: Parseable<T>,
};

export type SyntaxParserParseOptions = {
    stream: boolean,
};

export class SyntaxParser<T> {
    readonly #parseable: Parseable<T>;
    readonly #buffer: Token[] = [];

    #cursor = 0;

    #state?: {
        generator: SyntaxParserGenerator<T>,
        result: IteratorResult<Command>,
    };

    constructor(options: SyntaxParserOptions<T>) {
        this.#parseable = options.parseable;
    }

    * parse(tokens: Token[], options?: SyntaxParserParseOptions) {
        this.#buffer.push(...tokens);

        const length = this.#buffer.length + +(options?.stream !== true);

        for (; this.#cursor < length; this.#cursor++) {
            const token = this.#buffer[this.#cursor] ?? null;

            let command: Command = {kind: CommandKind.Peek};

            while (command.kind !== CommandKind.Consume) {
                if (token === null && !this.#state) {
                    break;
                }

                if (!this.#state) {
                    const generator = this.#parseable.parse();
                    const result = generator.next();

                    this.#state = {
                        generator,
                        result,
                    };
                }

                if (this.#state.result.done) {
                    this.#buffer.splice(0, this.#cursor);
                    this.#cursor = 0;

                    yield this.#state.result.value;
                    this.#state = undefined;
                } else {
                    command = this.#state.result.value;

                    try {
                        if (command.kind === CommandKind.Cursor) {
                            this.#state.result = this.#state.generator.next({
                                kind: command.kind,
                                result: this.#cursor,
                            });

                            this.#cursor = command.data ?? this.#cursor;
                        } else {
                            this.#state.result = this.#state.generator.next({
                                kind: command.kind,
                                result: token,
                            });
                        }
                    } catch (error) {
                        // TODO: Observe behavior
                        // Errors thrown at the end of the stream are ignored
                        if (token === null) {
                            return;
                        }

                        throw error;
                    }
                }
            }
        }
    }

    * flush() {
        yield* this.parse([], {stream: false});
    }
}

export class FatalError<T> {
    readonly error: T;

    constructor(error: T) {
        this.error = error;
    }
}

export class SyntaxParserStream<T> extends TransformStream<Token[], T[]> {
    constructor(
        options: SyntaxParserOptions<T>,
        writableStrategy?: QueuingStrategy<Token[]>,
        readableStrategy?: QueuingStrategy<T[]>,
    ) {
        const process = ((
            syntaxParser = new SyntaxParser(options),
            previousTokens?: Token[]
        ) => (
            (controller: TransformStreamDefaultController<T[]>, tokens?: Token[]) => {
                if (previousTokens) {
                    const options = {stream: tokens !== undefined};
                    const nodes = Array.from(
                        syntaxParser.parse(previousTokens, options),
                    );

                    if (nodes.length > 0) {
                        controller.enqueue(nodes);
                    }
                }

                previousTokens = tokens;
            }
        ))();

        super(
            <Transformer<Token[], T[]>>{
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

export const command = {
    * peek(): SyntaxParserGenerator<Token | null> {
        const request = {kind: CommandKind.Peek} as const;
        const response = yield request;

        if (response.kind !== request.kind) {
            throw new Error();
        }

        return response.result;
    },
    * consume(): SyntaxParserGenerator<Token | null> {
        const request = {kind: CommandKind.Consume} as const;
        const response = yield request;

        if (response.kind !== request.kind) {
            throw new Error();
        }

        return response.result;
    },
    * cursor(data?: number): SyntaxParserGenerator<number> {
        const request = {kind: CommandKind.Cursor, data} as const;
        const response = yield request;

        if (response.kind !== request.kind) {
            throw new Error();
        }

        return response.result;
    },
} as const;

export const utils = {
    * choiceWithIndices<T extends SyntaxParserGenerator<any>[]>(
        ...parseGenerators: T
    ): SyntaxParserGenerator<
        {
            [K in keyof T]: T[K] extends SyntaxParserGenerator<infer I> ? {
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

        const initialPosition = yield* command.cursor();

        let furthestResult:
            | (
            & { position: number; index: number }
            & (
            | {
            value: T[number] extends SyntaxParserGenerator<infer I> ? I
                : never;
        }
            | { error: unknown }
            )
            )
            | undefined = undefined;

        for (let index = 0; index < parseGenerators.length; index++) {
            try {
                const value = yield* parseGenerators[index];
                const position = yield* command.cursor(initialPosition);

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
                const position = yield* command.cursor(initialPosition);

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

        yield* command.cursor(furthestResult.position);

        if ("error" in furthestResult) {
            throw furthestResult.error;
        }

        return furthestResult as any;
    },
    * choice<T extends SyntaxParserGenerator<any>[]>(
        ...parseGenerators: T
    ) {
        return (yield* utils.choiceWithIndices(...parseGenerators))
            .value as T[number] extends SyntaxParserGenerator<infer I> ? I : never;
    },
    * firstChoiceWithIndices<T extends SyntaxParserGenerator<any>[]>(
        ...parseGenerators: T
    ): SyntaxParserGenerator<
        {
            [K in keyof T]: T[K] extends SyntaxParserGenerator<infer I> ? {
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

        const initialPosition = yield* command.cursor();

        let furthestResult:
            | (
            & { position: number; index: number }
            & (
            | {
            value: T[number] extends SyntaxParserGenerator<infer I> ? I
                : never;
        }
            | { error: unknown }
            )
            )
            | undefined = undefined;

        for (let index = 0; index < parseGenerators.length; index++) {
            try {
                const value = yield* parseGenerators[index];
                const position = yield* command.cursor(initialPosition);

                if (
                    furthestResult === undefined ||
                    furthestResult.position < position ||
                    "error" in furthestResult
                ) {
                    yield* command.cursor(position);

                    return {
                        position,
                        index,
                        value,
                    } as any;
                }
            } catch (error) {
                const position = yield* command.cursor(initialPosition);

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
        yield* command.cursor(furthestResult.position);

        if ("error" in furthestResult) {
            throw furthestResult.error;
        }

        return furthestResult as any;
    },
    * firstChoice<T extends SyntaxParserGenerator<any>[]>(
        ...parseGenerators: T
    ) {
        return (yield* utils.firstChoiceWithIndices(...parseGenerators))
            .value as T[number] extends SyntaxParserGenerator<infer I> ? I : never;
    },
    * fatal<T>(parseGenerator: SyntaxParserGenerator<T>) {
        try {
            return yield* parseGenerator;
        } catch (error) {
            if (error instanceof FatalError) {
                throw error;
            }

            throw new FatalError(error);
        }
    },
    * maybe<T>(parseGenerator: SyntaxParserGenerator<T>) {
        const initialPosition = yield* command.cursor();

        try {
            return yield* parseGenerator;
        } catch (error) {
            yield* command.cursor(initialPosition);

            if (error instanceof FatalError) {
                throw error.error;
            }

            return undefined;
        }
    },
    * many<T>(parseGeneratorFn: () => SyntaxParserGenerator<T>) {
        const buffer: T[] = [];

        for (; ;) {
            const result = yield* this.maybe(parseGeneratorFn());

            if (result) {
                buffer.push(result);
                continue
            }

            break;
        }

        return buffer;
    },
    * lookAHead<T>(parseGenerator: SyntaxParserGenerator<T>) {
        const initialPosition = yield* command.cursor();

        try {
            return {
                result: yield* parseGenerator,
                position: yield* command.cursor(initialPosition),
            };
        } catch (error) {
            yield* command.cursor(initialPosition);

            if (error instanceof FatalError) {
                throw error.error;
            }

            throw error;
        }
    },
    * token<Payload extends string = string>(
        kind: TokenKind,
        payload?: Payload,
    ): SyntaxParserGenerator<Token<Payload>> {
        const token = yield* command.peek();

        if (
            token &&
            (token.kind & kind) > 0 &&
            (payload === undefined || token.payload === payload)
        ) {
            return (yield* command.consume()) as Token<Payload>;
        }

        throw new Error(`unexpected token: ${Deno.inspect(token)} != ${Deno.inspect({
            kind: stringifyTokenKind(kind),
            payload,
        })}`);
    },
} as const;