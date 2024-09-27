import { toTransformStream } from "@std/streams";

import { customInspect } from "./utils.ts";


export class Cursor {
    constructor(
        readonly source: URL,
        readonly position: number,
        readonly column: number,
        readonly line: number,
    ) {
    }

    [customInspect]() {
        return `${this.source.href}:${this.line + 1}:${this.column + 1}`;
    }
}

export class Span {
    readonly begin: Cursor;
    readonly end: Cursor;

    constructor(begin: Cursor, end: Cursor) {
        this.begin = begin;
        this.end = end;
    }

    static around(first: Span, last?: Span) {
        return (
            last
                ? new Span(
                    first.begin,
                    last.end,
                )
                : first
        );
    }
}

export class CodePoint {
    readonly #codePoint: number;

    readonly span: Span;

    constructor(codePoint: number, span: Span) {
        this.#codePoint = codePoint;
        this.span = span;
    }

    [Symbol.toPrimitive]() {
        return this.#codePoint;
    }
}

export class CodePointsStream {
    readonly writable!: WritableStream<string>;
    readonly readable!: ReadableStream<CodePoint[]>;

    constructor(source: URL) {
        Object.assign(this, toTransformStream<string, CodePoint[]>(
            async function* (src) {
                let position = 0;
                let column = 0;
                let line = 0;

                for await (const chunk of src)
                    yield Array.from(chunk, character => {
                        const codePoint = character.codePointAt(0)!;
                        const begin = new Cursor(
                            source,
                            position,
                            column,
                            line,
                        );

                        if (+codePoint !== 10) {
                            column += 1;
                        } else {
                            column = 0;
                            line += 1;
                        }

                        position += 1;

                        return new CodePoint(
                            codePoint,
                            new Span(
                                begin,
                                new Cursor(
                                    source,
                                    position,
                                    column,
                                    line,
                                ),
                            ),
                        );
                    });
            },
        ));
    }
}
