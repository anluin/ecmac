import { StatementNode } from "./compiler/languages/ecmascript/syntax_tree.ts";
import { Token } from "./compiler/languages/ecmascript/token.ts";
import { CodePointsStream } from "./compiler/code_point.ts";
import { ParserStream } from "./compiler/parser.ts";


const source = new URL("../samples/hello_world.js", import.meta.url);
const response = await fetch(source);

if (response.body) {
    for await (const statements of (
        response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new CodePointsStream(source))
            .pipeThrough(new ParserStream(Token))
            .pipeThrough(new ParserStream(StatementNode))
    )) {
        console.log(statements);
    }
}
