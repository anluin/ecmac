import { TokenDecoderStream } from "./compiler/lexical_analysis.ts";

console.time();

const sourceUrl = new URL(/*"../samples/hello_world.js", */import.meta.url);

for await (const token of await fetch(sourceUrl)
    .then(response =>
        (response.body ?? ReadableStream.from([]))
            .pipeThrough(new TokenDecoderStream(sourceUrl))
    )) {

    console.log(token);
}

console.timeEnd();
