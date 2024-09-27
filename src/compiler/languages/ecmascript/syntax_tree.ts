import { FatalError, ParserStream, ParserStreamGenerator, ParserStreamParsable, Position } from "../../parser.ts";
import { IdentifierToken, PunctuatorToken, StringToken, Token } from "./token.ts";
import { customInspect } from "../../utils.ts";


export abstract class Node {

}

export abstract class ExpressionNode extends Node {
    static primaryDerivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>>[] = [];
    static leftHandDerivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>, [ leftHandExpressionNode?: ExpressionNode ]>[] = [];

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        let expression = (yield* ParserStream.first(
            ...this.primaryDerivedClasses.map(
                (derivedClass) =>
                    derivedClass.parse(),
            ),
        )).value;

        for (; ;) {
            const leftHandedExpression = (yield* ParserStream.first(
                ...this.leftHandDerivedClasses.map(
                    (derivedClass) =>
                        derivedClass.parse(expression),
                ),
                ParserStream.null(),
            )).value;

            if (leftHandedExpression !== null) {
                expression = leftHandedExpression;
                continue;
            }

            break;
        }

        return expression;
    }
}

export abstract class PrimaryExpressionNode extends ExpressionNode {
    static derivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>>[] = [];

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return (yield* ParserStream.first(
            ...this.derivedClasses.map(
                (derivedClass) =>
                    derivedClass.parse(),
            ),
        )).value;
    }

    static {
        super.primaryDerivedClasses.push(this);
    }
}

export class IdentifierNode extends PrimaryExpressionNode {
    constructor(
        readonly token: IdentifierToken,
    ) {
        super();
    }

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return new this(
            yield* IdentifierToken.consume(),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export abstract class LiteralExpressionNode extends PrimaryExpressionNode {
    static derivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>>[] = [];

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return (yield* ParserStream.first(
            ...this.derivedClasses.map(
                (derivedClass) =>
                    derivedClass.parse(),
            ),
        )).value;
    }

    static {
        super.derivedClasses.push(this);
    }
}

export class StringLiteralNode extends LiteralExpressionNode {
    constructor(
        readonly token: StringToken,
    ) {
        super();
    }

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return new this(
            yield* StringToken.consume(),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export abstract class LeftHandExpressionNode extends ExpressionNode {
    static derivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>, [ leftHandExpressionNode?: ExpressionNode ]>[] = [];

    static* parse(leftHandExpressionNode?: ExpressionNode): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        leftHandExpressionNode ??= yield* ExpressionNode.parse();

        return (yield* ParserStream.first(
            ...this.derivedClasses.map(
                (derivedClass) =>
                    derivedClass.parse(leftHandExpressionNode),
            ),
        )).value;
    }

    static {
        super.leftHandDerivedClasses.push(this);
    }
}

export class MemberExpressionNode extends LeftHandExpressionNode {
    constructor(
        readonly object: ExpressionNode,
        readonly dotToken: PunctuatorToken<".">,
        readonly identifierToken: IdentifierToken,
    ) {
        super();
    }

    static* parse(leftHandExpressionNode?: ExpressionNode): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return new this(
            leftHandExpressionNode ??= yield* ExpressionNode.parse(),
            yield* PunctuatorToken.consume("."),
            yield* IdentifierToken.consume(),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}

export class ArgumentNode extends Node {
    constructor(
        readonly expressionNode: ExpressionNode,
        readonly commaToken: PunctuatorToken<","> | null,
    ) {
        super();
    }

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return new this(
            yield* ExpressionNode.parse(),
            yield* ParserStream.maybe(
                PunctuatorToken.consume(","),
            ),
        );
    }
}

export class CallExpressionNode extends LeftHandExpressionNode {
    constructor(
        readonly calleeExpressionNode: ExpressionNode,
        readonly leftParenthesisToken: PunctuatorToken<"(">,
        readonly argumentNodes: ArgumentNode[],
        readonly rightParenthesisToken: PunctuatorToken<")">,
    ) {
        super();
    }

    static* parse(leftHandExpressionNode?: ExpressionNode): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        const calleeExpressionNode = leftHandExpressionNode ??= yield* ExpressionNode.parse();
        const leftParenthesisToken = yield* PunctuatorToken.consume("(");
        const argumentNodes: ArgumentNode[] = [];

        for (; ;) {
            try {
                const tmp = (yield* ParserStream.fatal((
                    (
                        argumentNodes.length === 0 ||
                        argumentNodes.at(-1)?.commaToken !== null
                    )
                        ? ParserStream.first(
                            PunctuatorToken.consume(")"),
                            ArgumentNode.parse(),
                        )
                        : ParserStream.first(
                            PunctuatorToken.consume(")"),
                        )
                ))).value;

                if (tmp instanceof PunctuatorToken) {
                    return new this(
                        calleeExpressionNode,
                        leftParenthesisToken,
                        argumentNodes,
                        tmp,
                    );
                }

                argumentNodes.push(tmp);
            } catch (_error) {
                const position = yield* ParserStream.position();
                yield* ParserStream.position((position - 1) as Position);
                const lastToken = (yield* ParserStream.consume());

                if (!(lastToken instanceof PunctuatorToken) && lastToken.payload === ",") {
                    throw new FatalError(`${lastToken.span.end[customInspect]()}: , or ) expected`);
                }

                throw new FatalError(`${lastToken.span.end[customInspect]()}: Expression or ) expected`);
            }
        }
    }

    static {
        super.derivedClasses.push(this);
    }
}

export abstract class StatementNode extends Node {
    static derivedClasses: ParserStreamParsable<Token, InstanceType<typeof this>>[] = [];

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return (yield* ParserStream.first(
            ...this.derivedClasses.map(
                (derivedClass) =>
                    derivedClass.parse(),
            ),
        )).value;
    }
}

export class ExpressionStatementNode extends StatementNode {
    constructor(
        readonly expression: ExpressionNode,
        readonly semicolonToken: PunctuatorToken<";"> | null,
    ) {
        super();
    }

    static* parse(): ParserStreamGenerator<Token, InstanceType<typeof this>> {
        return new this(
            yield* ExpressionNode.parse(),
            yield* ParserStream.maybe(
                PunctuatorToken.consume(";"),
            ),
        );
    }

    static {
        super.derivedClasses.push(this);
    }
}
