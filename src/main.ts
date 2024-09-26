import { Statement, tokenizer } from "./compiler/languages/ecmascript/mod.ts";
import { SyntaxParserStream } from "./compiler/syntax_analysis.ts";
import { TokenParserStream } from "./compiler/lexical_analysis.ts";


console.time();

const sourceUrl = new URL("../samples/hello_world.js", import.meta.url);

for await (const statement of await (
    fetch(sourceUrl)
        .then((response) => (
            (response.body ?? ReadableStream.from([]))
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(new TokenParserStream({sourceUrl, tokenizer}))
                .pipeThrough(new SyntaxParserStream({parseable: Statement}))
        ))
)) {
    console.log(statement);
}

console.timeEnd();
