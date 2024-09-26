// noinspection JSUnusedGlobalSymbols

import { Parseable, SyntaxParserGenerator, utils } from "../../syntax_analysis.ts";
import { Token, TokenKind } from "../../lexical_analysis.ts";


export abstract class Expression {
    static derivedClasses: Parseable<InstanceType<typeof this>>[] = [];
    static derivedModifierClasses: Parseable<
        InstanceType<typeof this>,
        [ expression?: Expression ]
    >[] = [];

    static* parse(): SyntaxParserGenerator<InstanceType<typeof this>> {
        let expression = yield* utils.choice(
            ...this.derivedClasses
                .map((derivedClass) => derivedClass.parse()),
        );

        for (; ;) {
            const modifiedExpression = yield* utils.maybe(utils.choice(
                ...this.derivedModifierClasses.map(
                    (derivedClass) =>
                        derivedClass.parse(expression),
                ),
            ));

            if (modifiedExpression) {
                expression = modifiedExpression;
                continue;
            }

            break;
        }

        return expression;
    }
}

export abstract class PrimaryExpression extends Expression {
    static derivedClasses: Parseable<InstanceType<typeof this>>[] = [];

    static* parse() {
        return yield* utils.choice(
            ...this.derivedClasses
                .map((derivedClass) => derivedClass.parse()),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export class Identifier extends PrimaryExpression {
    constructor(
        readonly token: Token,
    ) {
        super();
    }

    static* parse() {
        return new Identifier(
            yield* utils.token(TokenKind.Identifier),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export abstract class Literal extends PrimaryExpression {
    static derivedClasses: Parseable<InstanceType<typeof this>>[] = [];

    static* parse() {
        return yield* utils.choice(
            ...this.derivedClasses.map((derivedClass) => derivedClass.parse()),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export class StringLiteral extends Literal {
    readonly token: Token;

    constructor(token: Token) {
        super();
        this.token = token;
    }

    static* parse() {
        return new this(
            yield* utils.token(TokenKind.String),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export abstract class MemberProperty {
    static derivedClasses: Parseable<InstanceType<typeof this>>[] = [];

    static* parse() {
        return yield* utils.choice(
            ...this.derivedClasses.map((derivedClass) => derivedClass.parse()),
        );
    }
}

export class StaticMemberProperty extends MemberProperty {
    readonly dotToken: Token;
    readonly identifier: Token;

    constructor(dotToken: Token, identifier: Token) {
        super();
        this.dotToken = dotToken;
        this.identifier = identifier;
    }

    static* parse() {
        return new this(
            yield* utils.token(TokenKind.Punctuator, "."),
            yield* utils.fatal(utils.token(TokenKind.Identifier)),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export class MemberExpression extends Expression {
    readonly object: Expression;
    readonly property: MemberProperty;

    constructor(object: Expression, property: MemberProperty) {
        super();
        this.object = object;
        this.property = property;
    }

    static* parse(expression?: Expression) {
        // noinspection JSUnusedAssignment
        return new this(
            expression ??= yield* Expression.parse(),
            yield* MemberProperty.parse(),
        );
    }

    static {
        super.derivedModifierClasses.push(this);
    }
}

export class CallArgument {
    readonly expression: Expression;
    readonly commaToken?: Token<",">;

    constructor(expression: Expression, commaToken?: Token<",">) {
        this.expression = expression;
        this.commaToken = commaToken;
    }

    static* parse() {
        return new this(
            yield* Expression.parse(),
            yield* utils.maybe(
                utils.token(TokenKind.Punctuator, ","),
            ),
        );
    }
}

export class CallExpression extends Expression {
    readonly callee: Expression;
    readonly openToken: Token<"(">;
    readonly args: CallArgument[];
    readonly closeToken: Token<")">;

    constructor(
        callee: Expression,
        openToken: Token<"(">,
        args: CallArgument[],
        closeToken: Token<")">,
    ) {
        super();
        this.callee = callee;
        this.openToken = openToken;
        this.args = args;
        this.closeToken = closeToken;
    }

    static* parse(expression?: Expression) {
        expression ??= yield* Expression.parse();

        const openToken = yield* utils.token(TokenKind.Punctuator, "(");
        const args: CallArgument[] = [];

        for (; ;) {
            const argsOrClose = yield* utils.fatal(
                utils.choiceWithIndices(
                    utils.token(TokenKind.Punctuator, ")"),
                    CallArgument.parse(),
                ),
            );

            if (argsOrClose.index === 1) {
                args.push(argsOrClose.value);

                if (argsOrClose.value.commaToken) {
                    continue;
                }
            }

            return new this(
                expression,
                openToken,
                args,
                argsOrClose.index === 1
                    ? yield* utils.fatal(
                        utils.token(TokenKind.Punctuator, ")"),
                    )
                    : argsOrClose.value,
            );
        }
    }

    static {
        super.derivedModifierClasses.push(this);
    }
}

export class Statement {
    static derivedClasses: Parseable<InstanceType<typeof this>>[] = [];

    static* parse() {
        // Skip comments, whitespace and line terminators
        yield* utils.many(
            () => utils.token((
                TokenKind.Comment |
                TokenKind.Whitespace |
                TokenKind.LineTerminator
            )),
        );

        return yield* utils.firstChoice(
            ...this.derivedClasses.map((derivedClass) => derivedClass.parse()),
        );
    }
}

export class ExpressionStatement extends Statement {
    readonly expression: Expression;
    readonly semicolonToken?: Token<";">;

    constructor(expression: Expression, semicolonToken?: Token<";">) {
        super();
        this.expression = expression;
        this.semicolonToken = semicolonToken;
    }

    static* parse() {
        return new this(
            yield* Expression.parse(),
            yield* utils.maybe(
                utils.token(TokenKind.Punctuator, ";"),
            ),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}