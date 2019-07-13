;
function VariableHunter() {
    var esprima = require('esprima');

    var variables = [];

    function extraction(node){
        switch(node.type){
            case 'VariableDeclarator':
                variables.push(node.id.name);
                break;
            case 'AssignmentExpression':
                if (node.left.name){
                    variables.push(node.left.name);
                } else if (node.left.property.name){
                    variables.push(node.left.property.name)
                }

                break;
        }
    }

    this.GetVariablesFromScope = function(code){
        variables = [];
        var codeTree = esprima.parseScript(code, {}, extraction);
        return variables;
    }

    function traverse(node, func) {
        func(node);//1
        for (var key in node) { //2
            if (node.hasOwnProperty(key)) { //3
                var child = node[key];
                if (typeof child === 'object' && child !== null) { //4

                    if (Array.isArray(child)) {
                        child.forEach(function(node) { //5
                            traverse(node, func);
                        });
                    } else {
                        traverse(child, func); //6
                    }
                }
            }
        }
    }

    this.GetAssignmentsFrom = function(tree){
        variables = [];
        traverse(tree, extraction);
        return variables;
    }

    this.GetArgumensWithValues = function(node){
        let result = [];
        if (node.type === 'ExpressionStatement'){
            if (node.expression.type === 'AssignmentExpression'
            && node.expression.right.type === 'CallExpression'){
                result = this.GetArgumensWithValues(node.expression.right.callee);
            }
        } else if (node.type === 'CallExpression'){

            for (let i = 0; i < node.arguments.length; i++){
                if (node.arguments[i].type === 'Identifier'){
                    result.push(node.arguments[i].name);
                } else if (node.arguments[i].type === 'MemberExpression'
                && node.arguments[i].object.type === 'ThisExpression'){
                    result.push(node.arguments[i].property.name);
                }
            }
            let tmp = this.GetArgumensWithValues(node.callee);
            for (let i = 0; i < tmp.length; i++){
                result.push(tmp[i]);
            }
        } else if (node.type === 'MemberExpression'){
            if (node.object.type === 'ThisExpression'){
                result.push(node.property.name);
            } else {
                result = this.GetArgumensWithValues(node.object);
            }
        }
        return result;
    }
};

module.exports = VariableHunter;
