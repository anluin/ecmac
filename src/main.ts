import { tokenize } from "./compiler/lexical_analysis.ts";

console.time();

for await (const token of tokenize(new URL("./main.ts", import.meta.url))) {
    console.log(token);
}

console.timeEnd();
