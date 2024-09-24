import { tokenize } from "./compiler/lexical_analysis.ts";

console.time();

const sourceUrl = new URL("../samples/hello_world.js", import.meta.url);

for await (const token of tokenize(sourceUrl)) {

    console.log(token);
}

console.timeEnd();
