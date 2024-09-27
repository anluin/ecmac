import { toTransformStream } from "@std/streams";
import { assert } from "@std/assert";

import { AsNumber } from "./utils.ts";


const enum ParserStreamCommandKind {
    Peek = 0,
    Consume,
    Position,
}

type PeekCommand<I> = {
    kind: ParserStreamCommandKind.Peek,
    result: I,
};

type ConsumeCommand<I> = {
    kind: ParserStreamCommandKind.Consume,
    result: I,
};

declare const PositionTag: unique symbol;
export type Position = number & { [PositionTag]: void };

type PositionCommand = {
    kind: ParserStreamCommandKind.Position,
    args: [ value?: Position ],
    result: Position,
};

export type ParserStreamCommand<I>
    = PeekCommand<I>
    | ConsumeCommand<I>
    | PositionCommand;


export class EndOfParserStream extends Error {
}


const fatalErrorTag = Symbol();

declare global {
    interface Error {
        [fatalErrorTag]?: boolean,
    }
}

export class FatalError extends Error {
    readonly [fatalErrorTag] = true;
}

export type ParserStreamGenerator<InputItem, OutputItem> =
    Generator<Omit<ParserStreamCommand<InputItem>, "result">, OutputItem, ConsumeCommand<InputItem>>

export type ParserStreamParsable<InputItem, OutputItem, Args extends unknown[] = []> = {
    parse(...args: Args): ParserStreamGenerator<InputItem, OutputItem>,
};

export type ParserStreamGeneratorFn<InputItem, OutputItem> =
    ParserStreamParsable<InputItem, OutputItem>["parse"];


export const isParserStreamParsable = <InputItem, OutputItem>(value: unknown):
    value is ParserStreamParsable<InputItem, OutputItem> =>
    // deno-lint-ignore no-explicit-any
    (value as any)?.parse instanceof Function;

export class ParserStream<InputItem, OutputItem> {
    readonly writable!: WritableStream<InputItem[]>;
    readonly readable!: ReadableStream<OutputItem[]>;

    constructor(
        parserOrParsable
            : ParserStreamParsable<InputItem, OutputItem>
            | ParserStreamGeneratorFn<InputItem, OutputItem>,
    ) {
        const parser = (
            isParserStreamParsable(parserOrParsable)
                ? parserOrParsable.parse.bind(parserOrParsable)
                : parserOrParsable
        );

        Object.assign(this, toTransformStream<InputItem[], OutputItem[]>(
            async function* (src) {
                const inputBuffer: InputItem[] = [];
                const outputBuffer: OutputItem[] = [];

                let cursor = 0;
                let state: {
                    generator: ParserStreamGenerator<InputItem, OutputItem>,
                    result: IteratorResult<Omit<ParserStreamCommand<InputItem>, "result">>,
                } | null = null;

                const process = (chunk: InputItem[] | null) => {
                    if (chunk) inputBuffer.push(...chunk);

                    while ((
                        chunk === null && state !== null
                            ? cursor <= inputBuffer.length
                            : cursor < inputBuffer.length
                    )) {
                        if (!state) {
                            if (cursor >= inputBuffer.length) break;
                            const generator = parser();
                            const result = generator.next();
                            if (result.done) throw new Error("parser doesn't consume any items");
                            state = {generator, result};
                        }

                        const command = state.result.value;

                        switch (command.kind) {
                            case ParserStreamCommandKind.Peek:
                            case ParserStreamCommandKind.Consume:
                                command.result = inputBuffer[cursor];

                                if (cursor >= inputBuffer.length) {
                                    try {
                                        state.result = state.generator.throw(new EndOfParserStream());
                                    } catch (error) {
                                        if (error instanceof EndOfParserStream) {
                                            state = null;
                                            continue;
                                        }

                                        throw error;
                                    }
                                } else {
                                    state.result = state.generator.next(command);
                                    cursor += command.kind;
                                }

                                break;
                            case ParserStreamCommandKind.Position:
                                command.result = cursor;
                                cursor = command.args[0] ?? cursor;
                                state.result = state.generator.next(command);

                                break;
                            default:
                                throw new Deno.errors.InvalidData(`received invalid command: ${Deno.inspect(command)}`);
                        }

                        if (state.result.done) {
                            if (cursor === 0) throw new Error("parser doesn't consume any items");
                            outputBuffer.push(state.result.value);
                            inputBuffer.splice(0, cursor);
                            state = null;
                            cursor = 0;
                        }
                    }
                };

                try {
                    for await (const chunk of src) {
                        if (outputBuffer.length > 0) {
                            yield outputBuffer.splice(0);
                        }

                        process(chunk);
                    }

                    while (state) {
                        process(null);
                    }
                } finally {
                    if (outputBuffer.length > 0) {
                        yield outputBuffer;
                    }
                }

                if (inputBuffer.length > 0) {
                    throw Error("parser was not able to completely process the input stream");
                }
            },
        ));
    }

    // TODO: Write some docs
    static* position<Item>(...args: [ value?: Position ]): ParserStreamGenerator<Item, Position> {
        return (yield (<PositionCommand>{kind: ParserStreamCommandKind.Position, args})).result as Position;
    }

    /**
     * Retrieves the current item of input without advancing the cursor. </br>
     * This allows inspecting the next item in the stream without consuming it.
     *
     * @returns {Item} The current item of input.
     * @template Item The type of the input elements.
     * @throws {EndOfParserStream} If the end of the input stream is reached.
     */
    static* peek<Item>(): ParserStreamGenerator<Item, Item> {
        return (yield {kind: ParserStreamCommandKind.Peek}).result;
    }

    /**
     * Retrieves the current item of input and advances the cursor. </br>
     * This allows consuming and moving to the next item in the stream.
     *
     * @returns {Item} The current item of input.
     * @template Item The type of the input elements.
     * @throws {EndOfParserStream} If the end of the input stream is reached.
     */
    static* consume<Item>(): ParserStreamGenerator<Item, Item> {
        return (yield {kind: ParserStreamCommandKind.Consume}).result;
    }

    /**
     * Attempts to peek at the current item of input. </br>
     * If the end of the stream is reached, it catches the `EndOfParserStream` error and returns `null`.
     *
     * @returns {Item | null} The current item of input or `null` if the end of the stream is reached.
     * @template Item The type of the input elements.
     */
    static* tryPeek<Item>(): ParserStreamGenerator<Item, Item | null> {
        try {
            return yield* this.peek<Item>();
        } catch (error) {
            if (error instanceof EndOfParserStream) {
                return null;
            }

            throw error;
        }
    }

    /**
     * Attempts to retrieve the current item of input and advances the cursor. </br>
     * This allows consuming and moving to the next item in the stream.
     *
     * @returns {Item | null} The current item of input or `null` if the end of the stream is reached.
     * @template Item The type of the input elements.
     */
    static* tryConsume<Item>(): ParserStreamGenerator<Item, Item | null> {
        try {
            return yield* this.consume<Item>();
        } catch (error) {
            if (error instanceof EndOfParserStream) {
                return null;
            }

            throw error;
        }
    }

    /**
     * Checks whether the end of the input stream has been reached. </br>
     * Returns `true` if there are no more items to process, otherwise `false`.
     *
     * @returns {boolean} True if the end of the input stream is reached, otherwise false.
     * @template Item The type of the input elements.
     */
    static* end<Item>(): ParserStreamGenerator<Item, boolean> {
        return (yield* this.tryPeek()) === null;
    }

    static* consumeInstanceOf<T extends {
        // deno-lint-ignore no-explicit-any
        new(): any
    }>(derivedClass: T): ParserStreamGenerator<InstanceType<T>, InstanceType<T>> {
        // deno-lint-ignore no-explicit-any
        const item: any = yield* ParserStream.peek();

        if (item instanceof derivedClass) {
            // deno-lint-ignore no-explicit-any
            return yield* ParserStream.consume() as any;
        }

        throw new Error(`reached unexpected item: ${Deno.inspect(item)}`);
    }

    // Returns the result of the generator that went the furthest
    // deno-lint-ignore no-explicit-any
    static* furthest<T extends ParserStreamGenerator<any, any>[]>(
        ...generators: T
        // deno-lint-ignore no-explicit-any
    ): ParserStreamGenerator<any, {
        // deno-lint-ignore no-explicit-any
        [K in keyof T]: T[K] extends ParserStreamGenerator<any, infer I> ? {
                index: K extends `${number}` ? AsNumber<K> : number;
                position: Position;
                value: I;
            }
            : never;
    }[number]> {
        const initialPosition = yield* ParserStream.position();

        let furthestResult:
            | { position: Position; index: number, value: unknown }
            | { position: Position; index: number, error: unknown }
            | null = null;

        for (let index = 0; index < generators.length; index++) {
            try {
                const value = yield* generators[index];
                const position = yield* ParserStream.position();

                if ((furthestResult?.position ?? -1) < position) {
                    furthestResult = {index, position, value};
                }
            } catch (error) {
                if (error instanceof Error && !!error[fatalErrorTag]) {
                    throw error;
                }

                const position = yield* ParserStream.position();

                if ((furthestResult?.position ?? -1) < position) {
                    furthestResult = {index, position, error};
                }
            } finally {
                yield* ParserStream.position(initialPosition);
            }
        }

        assert(furthestResult);

        yield* ParserStream.position(furthestResult.position);

        if ("error" in furthestResult) {
            throw furthestResult.error;
        }

        // deno-lint-ignore no-explicit-any
        return furthestResult as any;
    }

    // Returns the result of the first generator that has not thrown an error
    // deno-lint-ignore no-explicit-any
    static* first<T extends ParserStreamGenerator<any, any>[]>(
        ...generators: T
        // deno-lint-ignore no-explicit-any
    ): ParserStreamGenerator<any, {
        // deno-lint-ignore no-explicit-any
        [K in keyof T]: T[K] extends ParserStreamGenerator<any, infer I> ? {
                index: K extends `${number}` ? AsNumber<K> : number;
                position: Position;
                value: I;
            }
            : never;
    }[number]> {
        assert(generators.length > 0);

        const initialPosition = yield* ParserStream.position();

        let furthestError:
            | { position: Position; index: number, error: unknown }
            | null = null;

        for (let index = 0; index < generators.length; index++) {
            try {
                const value = yield* generators[index];
                const position = yield* ParserStream.position();

                // deno-lint-ignore no-explicit-any
                return {index, position, value} as any;
            } catch (error) {
                if (error instanceof Error && !!error[fatalErrorTag]) {
                    throw error;
                }

                const position = yield* ParserStream.position();

                if ((furthestError?.position ?? -1) < position) {
                    furthestError = {index, position, error};
                }

                yield* ParserStream.position(initialPosition);
            }
        }

        assert(furthestError);
        yield* ParserStream.position(furthestError.position);
        throw furthestError.error;
    }

    // deno-lint-ignore require-yield
    static* null<InputItem>(): ParserStreamGenerator<InputItem, null> {
        return null;
    }

    static* maybe<InputItem, OutputItem>(generator: ParserStreamGenerator<InputItem, OutputItem>) {
        const initialPosition = yield* ParserStream.position();

        try {
            return yield* generator;
        } catch (error) {
            if (error instanceof Error && !!error[fatalErrorTag]) {
                throw error;
            }

            yield* ParserStream.position(initialPosition);
            return null;
        }
    }

    static* fatal<InputItem, OutputItem>(generator: ParserStreamGenerator<InputItem, OutputItem>) {
        try {
            return yield* generator;
        } catch (error) {
            if (!(error instanceof Error)) {
                // deno-lint-ignore no-ex-assign
                error = new Error(Deno.inspect(error));
            }

            error[fatalErrorTag] = true;

            throw error;
        }
    }
}
