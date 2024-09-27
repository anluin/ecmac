export const customInspect = Symbol.for("Deno.customInspect");

export type StringToNumberMap = {
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

