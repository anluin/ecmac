import { tokenizer } from "./compiler/languages/ecmascript.ts";
import { tokenize } from "./compiler/lexical_analysis.ts";


console.time();

for await (const token of tokenize({
    sourceUrl: new URL("../samples/hello_world.js", import.meta.url),
    tokenizer,
})) {
    console.log(token);
}

console.timeEnd();
