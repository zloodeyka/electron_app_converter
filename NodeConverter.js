;
function NodeConverter() {

    var VariableHunter = require('./VariableHunter');
    var hunter = new VariableHunter();

    var esprima = require('esprima');
    this.NodeNumber = 0;
    this.PromiseNumber = 0;

    this.GetFunctionNodeName = function(number){
        return 'FunctionNode' + number;
    }

    this.VariableDeclarationToThisAssignment = function(declaration, kind, currentOwner){
        let result = {};
        if (currentOwner === null){
            result.type = 'VariableDeclaration';
            result.declarations = [];
            result.kind = kind;
            result.declarations.push(declaration);
        } else {
            let thisJS = 'this.' + declaration.id.name + '= null;';
            result = (esprima.parseScript(thisJS, {})).body[0];
            if (declaration.init !== null) {
                result.expression.right = declaration.init;
            }
        }
        return result;
    }

    this.GetNodeExecutionWrapper = function(node, isLastNode) {
        let nodefunctionJS = `this.FunctionNodeName = function () {};`;
        var newNode = (esprima.parseScript(nodefunctionJS, {})).body[0];

        newNode.expression.left.property.name = this.GetFunctionNodeName(this.NodeNumber++);
        newNode.expression.right.body.body.push(node);

        if (isLastNode){
            let nextNodeJS = 'this.' + this.GetFunctionNodeName(this.NodeNumber) + ".apply(context);";
            newNode.expression.right.body.body.push((esprima.parseScript(nextNodeJS, {})).body[0]);
        } else {
            let  nextNodeJS = `delete contextCash[contextID];`;
            newNode.expression.right.body.body.push((esprima.parseScript(nextNodeJS, {})).body[0]);
        }
        return newNode;
    }

    this.GetCallNode = function(node, variables){
        let params = [];
        if (variables) {
            for (let i = 0; i < variables.length; i++) {
                let obj = {};
                obj.type = "Literal";
                obj.value = variables[i];
                obj.raw = "\"" + variables[i] + "\"";
                params.push(obj);
            }
        }
        let callNodeJS = `this.FunctionNodeName = function(){
        let sendObject = GetClientArgumentsValues.apply(this, [[]]);
    websocket.send(JSON.stringify(CreateGetPackage(contextID, "CallFunctionNodeName", sendObject)));}`;

        let callNode = (esprima.parseScript(callNodeJS, {})).body[0];
        callNode.expression.left.property.name = this.GetFunctionNodeName(this.NodeNumber++);
        callNode.expression.right.body.body[1].expression.arguments[0].arguments[0].arguments[1].value = this.GetFunctionNodeName(this.NodeNumber);
        callNode.expression.right.body.body[1].expression.arguments[0].arguments[0].arguments[1].raw = "\"" + this.GetFunctionNodeName(this.NodeNumber) + "\"";
        callNode.expression.right.body.body[0].declarations[0].init.arguments[1].elements[0].elements = params;
        return callNode;
    }

    this.GetResponseNode = function(node){
        let assignments = hunter.GetAssignmentsFrom(node);
        let params = [];
        for (let i = 0; i < assignments.length; i++){
            let obj = {};
            obj.type = "Literal";
            obj.value = assignments[i];
            obj.raw = "\""+assignments[i]+"\"";
            params.push(obj);
        }
        let respJS = `this.FunctionNodeName = function(){
        client.send(
            CreateSetPackage("NextFunctionNodeName", GetVariables.apply(this, [["cpus"]]), this.contextID)
    );}`;
        let resp = (esprima.parseScript(respJS, {})).body[0];
        resp.expression.left.property.name = this.GetFunctionNodeName(this.NodeNumber++);
        resp.expression.right.body.body[0].expression.arguments[0].arguments[0].value = this.GetFunctionNodeName(this.NodeNumber);
        resp.expression.right.body.body[0].expression.arguments[0].arguments[0].raw = "\""+this.GetFunctionNodeName(this.NodeNumber)+"\"";
        resp.expression.right.body.body[0].expression.arguments[0].arguments[1].arguments[1].elements[0].elements = params;
        resp.expression.right.body.body.unshift(node);
        return resp;
    }

    this.GetFunctionDeclarationBody = function(node){
        let  funtionJS = `function ` + node.id.name + `() {
        let context = this;
        let contextID = contextsNumber++;
        contextCash[contextID]=context;
        }`;
        return (esprima.parseScript(funtionJS, {})).body[0];
    }

    this.GetEmptyFunctionBody = function(node){
        let  funtionJS = `function f() {
        let context = this;
        let contextID = contextsNumber++;
        contextCash[contextID]=context;
        }`;
        return (esprima.parseScript(funtionJS, {})).body[0];
    }

    this.GetPromiseName = function(number){
        return 'promise' + number;
    };

    this.GetPromiseNode = function(functionName, variableName){
        let promiseName = this.GetPromiseName(this.PromiseNumber++);

        let codeJS = `let ` +promiseName+` = new Promise((resolve, reject) => {
        `+functionName+`(resolve);
    });
    
    this.`+this.GetFunctionNodeName(this.NodeNumber++)+`=function(){
        `+promiseName+`.then(result => {
            context.`+variableName+` = result;
            `+this.GetFunctionNodeName(this.NodeNumber)+`.apply(context);
        });
    }`;
        return (esprima.parseScript(codeJS, {})).body;
    }
};

module.exports = NodeConverter;
