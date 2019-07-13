var esprima = require('esprima');
var fs = require('fs');
var escodegen = require('escodegen');
var VariableHunter = require('./VariableHunter');
var hunter = new VariableHunter();
var NodeConverter = require('./NodeConverter');
var nodeConverter = new NodeConverter();


Array.prototype.back = function(){
    if (this.length > 0){
        return this[this.length - 1];
    }
    throw 'Empty array exception';
}

Array.prototype.setBack = function(value){
    if (this.length > 0){
        this[this.length - 1] = value;
        return;
    }
    throw 'Empty array exception';
}

Array.prototype.distinct = function(){
    let used = {};
    for (let i = 0; i < this.length;){
        if (used.hasOwnProperty(this[i])){
            this.splice(i, 1);
        } else {
            i++;
        }
    }
}


let clientVariables =  [[]];
let serverVariables = [[]];

//var contextsNumber = 0;
let isLastNode = [];

var clientStack = [{
    "type": "Program",
    "body": [],
    "sourceType": "script"
}];

var serverStack = [{
    "type": "Program",
    "body": [],
    "sourceType": "script"
}];

var currentFunctionOwnerStack = [];

const NodeObjects = ['require', 'global', 'process',
    'Buffer', 'module', 'exports','__dirname', '__filename'];

const BrowserObjects = ['$', 'Chart', 'window', 'document', 'lastMeasureTimes'];

function AddVariable(type, name){
    if (type === 'Server'){
        serverVariables[serverVariables.length - 1].push(name);
    } else {
        clientVariables[clientVariables.length - 1].push(name);
    }
}


function IsNodeObject(name){
    for (var i = 0; i < NodeObjects.length; i++){
        if (NodeObjects[i] === name){
            return true;
        }
    }
    for (let i = serverVariables.length - 1; i >= 0; i--){
        for (let j = 0; j < serverVariables[i].length; j++) {
            if (serverVariables[i][j] === name) {
                return true;
            }
        }
    }
    return false;
}

function IsBrowserObject(name){
    for (let i = 0; i < BrowserObjects.length; i++){
        if (BrowserObjects[i] == name){
            return true;
        }
    }
    for (let i = clientVariables.length - 1; i >= 0; i--){
        for (let j = 0; j < clientVariables[i].length; j++) {
            if (clientVariables[i][j] === name) {
                return true;
            }
        }
    }
    return false;
}

function GetArgumensWithValues(node, currentScope){
    let vars = hunter.GetArgumensWithValues(node);

    let result = [];
    for (let item in vars){
        if (currentScope === 'Server'){
            if (IsNodeObject(vars[item])){
                result.push(vars[item]);
            }
        } else {
            if (IsBrowserObject(vars[item])){
                result.push(vars[item]);
            }
        }
    }
    return result.distinct();
}

function AddNode(who, node, doNotWrap = false){
    let currentScope = currentFunctionOwnerStack.back();

    let servernode = null;
    let clientnode = null;
    if (doNotWrap){
        servernode = node;
    } else if (currentScope!=null && currentScope!== who){
        let callNode = nodeConverter.GetCallNode(node, GetArgumensWithValues(node, currentScope));
        let execNode = nodeConverter.GetResponseNode(node, true);

        if (currentScope === 'Server'){
            servernode = callNode;
            clientnode = execNode;
        } else {
            servernode = execNode;
            clientnode = callNode;
        }

    } else if (currentScope!=null){
        if (who === 'Server') {
            servernode = nodeConverter.GetNodeExecutionWrapper(node, !isLastNode.back());
        } else {
            clientnode = nodeConverter.GetNodeExecutionWrapper(node, !isLastNode.back());
        }
    } else {
        if (who !== 'Server'){
            clientnode = node;
        } else {
            servernode = node;
        }
    }
    if (servernode!==null){
        if (serverStack.length - 1 > 0) {
            serverStack[serverStack.length - 1].body.body.push(servernode);
        } else {
            serverStack[serverStack.length - 1].body.push(servernode);
        }
    }
    if (clientnode!==null){
        if (clientStack.length - 1 > 0) {
            clientStack[clientStack.length - 1].body.body.push(clientnode);
        } else {
            clientStack[clientStack.length - 1].body.push(clientnode);
        }
    }
}

function AddPromiseNode(who, functionName, variableName){


    let body = nodeConverter.GetPromiseNode(functionName, variableName);

    if (who === 'Server'){
        if (serverStack.length - 1 > 0) {
            serverStack[serverStack.length - 1].body.body.push(body[0]);
            serverStack[serverStack.length - 1].body.body.push(body[1]);
        } else {
            serverStack[serverStack.length - 1].body.push(body[0]);
            serverStack[serverStack.length - 1].body.push(body[1]);
        }
    } else
    {
        if (clientStack.length - 1 > 0) {
            clientStack[clientStack.length - 1].body.body.push(body[0]);
            clientStack[clientStack.length - 1].body.body.push(body[1]);
        } else {
            clientStack[clientStack.length - 1].body.push(body[0]);
            clientStack[clientStack.length - 1].body.push(body[1]);
        }
    }
}

function GetCallExpressionOwner(node) {
    if (node.type === 'Identifier'){
        return node.name;
    }
    if (node.type === 'MemberExpression'){
        return GetCallExpressionOwner(node.object);
    }
    if (node.type === 'CallExpression'){
        return GetCallExpressionOwner(node.callee);
    }
}
//return true is serverMajor, otherwise false, null if undefined nodes win
/**
 * @return {string}
 */
function GetAssignmentMajor(node){
    if (!node){
        return 'None';
    }
    if (node.type === 'ArrayExpression'){
        if (node.elements === []){
            return 'None';
        }
        let s = 0, c = 0, ud = 0;
        for (let i = 0; i < node.elements.length; i++){
            if (node.elements[i].type === 'Literal'){
                ud++;
            } else if (node.elements[i].type === 'Identifier'){
                if (IsBrowserObject(node.elements[i].name)){
                    c++;
                } else if (IsNodeObject(node.elements[i].name)){
                    s++;
                } else {
                    ud++;
                }
            }
        }
        return ud > s && ud > c ? null : s > c;
    }
    if (node.type === 'CallExpression'){
        let name = GetCallExpressionOwner(node.callee);
        if (IsNodeObject(name)){
            return true;
        } else if (IsBrowserObject(name)){
            return true;
        } else {
            return null;
        }
    }
    return null;
}



function UpdateNewNodeArgs(node){
    if (node.expression.arguments===undefined || node.expression.arguments.length == 0){
        return;
    }
    for (let i = 0; i < node.expression.arguments.length; i++){
        if (node.expression.arguments[i].type === 'ArrowFunctionExpression'
            || node.expression.arguments[i].type === 'FunctionExpression'){
            let newNode = TraverseArrowFunctionReturnNode(node.expression.arguments[i]);
            node.expression.arguments[i].body = newNode.body;
        }
    }
    return node;
}

function IsJsObjectMethod(name){
    return Number.hasOwnProperty(name) || Object.hasOwnProperty(name);
}

function ClassifyVaribleDeclaration(node){
    for (let i = 0; i < node.declarations.length; i++){
        let newNode = nodeConverter.VariableDeclarationToThisAssignment(node.declarations[i],
            node.kind,
            currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1]);
        let name = node.declarations[i].id.name;
        if (node.declarations[i].init === null){
            //AddVariable('Client', name);
            AddNode('Client', newNode);
            continue;
        }
        let initType = node.declarations[i].init.type;
        if (initType === 'Literal'
            || initType === 'ArrayExpression'
            || initType === 'ObjectExpression'){
            AddNode('Client', newNode);
            AddVariable('Client', name)
            continue;
        }
        if (initType === 'Identifier'){
            if (IsNodeObject(node.declarations[i].init.name)) {
                AddNode('Server', newNode);
            } else {
                AddNode('Client', newNode);
            }
            continue;
        }
        if (initType === 'CallExpression'){
            if (node.declarations[i].init.callee.name === 'require'){

                AddVariable('Server', name);
                AddNode('Server', nodeConverter.VariableDeclarationToThisAssignment(node.declarations[i],
                    node.kind,
                    null), true);
                continue;
            }
            let classification = GetAssignmentMajor(node.declarations[i].init);
            let needPromise = false;

            UpdateFunctionExpressionArgs(node.declarations[i].init);
            if (IsJsObjectMethod(node.declarations[i].init.callee.name)){
                //AddNode(currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1], newNode);
            } else if (currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1] &&
                node.declarations[i].init.callee.type === 'Identifier'){
                needPromise = true;
            }
            if (classification === true){
                AddVariable('Server', name);
                if (needPromise){
                    AddPromiseNode('Server', node.declarations[i].init.callee.name, name);
                } else {
                    AddNode('Server', newNode);
                }
                continue;
            } else if (classification === false){
                if (needPromise){
                    AddPromiseNode('Client', node.declarations[i].init.callee.name, name);
                } else {
                    AddNode('Client', newNode);
                }
                continue;
            } else {
                if (needPromise){
                    AddPromiseNode(currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1], node.declarations[i].init.callee.name, name);
                } else {
                    AddNode(currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1], newNode);
                }
                continue;
            }


            if (initType === 'MemberExpression'){
                if (node.declarations[i].init.object.type === 'ThisExpression'){
                    AddVariable('Client', name)
                    AddNode('Client', newNode);
                } else if (IsNodeObject(node.declarations[i].init.object.name)){
                    AddVariable('Server', name)
                    AddNode('Server', newNode);
                } else if (IsBrowserObject(node.declarations[i].init.object.name)){
                    AddVariable('Client', name)
                    AddNode('Client', newNode);
                } else {
                    AddVariable(currentFunctionOwnerStack.back(), name)
                    AddNode(currentFunctionOwnerStack.back(), newNode);
                }
                continue;
            }
        }
    }
}

/**
 * @return bool
 */
function ClassifyExpressionStatement(node){
    if (node.expression.type === 'CallExpression'){
        if (!node.expression.callee){
            return null;
        }
        let tmpNode = node.expression.callee;
        while(tmpNode.type !== 'Identifier'){
            if (tmpNode.type === 'MemberExpression'){
                tmpNode = tmpNode.object;
            } else if (tmpNode.type === 'CallExpression'){
                tmpNode = tmpNode.callee;
            }
        }
        let name = tmpNode.name;
        if (IsNodeObject(name)){
            return true;
        } else if (IsBrowserObject(name)){
            return false;
        } else {
            return null;
        }
    }
    if (node.expression.type === 'AssignmentExpression') {
        if (IsNodeObject(node.expression.left.name)){
            return true;
        } else if (IsBrowserObject(node.expression.left.name)){
            return false;
        } else {
            return null;
        }
    }
}

function TraverseFunctionDeclaration(node){
    let isServer = false;
    let body = nodeConverter.GetFunctionDeclarationBody(node);

    body.params = node.params;
    if (isServer){
        serverVariables.push([]);
        serverStack.push(body);
        currentFunctionOwnerStack.push('Server');

    } else {
        clientVariables.push([]);
        clientStack.push(body);
        currentFunctionOwnerStack.push('Client');
    }

    //let firstNode = nodeConverter.NodeNumber;
    GenerateCode(node.body);

    let firstNode = null;
    if (isServer) {
        firstNode = GetFirstFunctionNode(serverStack[serverStack.length - 1]);
    } else {
        firstNode = GetFirstFunctionNode(clientStack[clientStack.length - 1]);
    }

    let lastNodeJs = 'this.'+firstNode+'.apply(context);';

    //let lastNodeJs = nodeConverter.GetFunctionNodeName(firstNode)+'.apply(context);';
    let lastNode = (esprima.parseScript(lastNodeJs, {})).body[0];

    if (isServer){
        serverVariables.pop();
        let f = serverStack.pop();
        f.body.body.push(lastNode);
        serverStack[serverStack.length - 1].body.push(f);
    } else {
        clientVariables.pop();
        let f = clientStack.pop();
        f.body.body.push(lastNode);
        if (clientStack.length > 1){
            clientStack[clientStack.length - 1].body.body.push(f);
        } else {
            clientStack[clientStack.length - 1].body.push(f);
        }
    }
    currentFunctionOwnerStack.pop();
}

function GetFirstFunctionNode(func){
    for (let i = 0; i < func.body.body.length; i++){
        if (func.body.body[i].type === 'ExpressionStatement'
            && func.body.body[i].expression.type === 'AssignmentExpression'
            && func.body.body[i].expression.left.type === 'MemberExpression'
            && func.body.body[i].expression.left.object.type === 'ThisExpression'){
            return func.body.body[i].expression.left.property.name;
        }
    }
}
function TraverseArrowFunctionReturnNode(node, isServer){
    let body = nodeConverter.GetEmptyFunctionBody(node);
    body.params = node.params;
    if (isServer){
        serverVariables.push([]);
        serverStack.push(body);
        currentFunctionOwnerStack.push('Server');
    } else {
        clientVariables.push([]);
        clientStack.push(body);
        currentFunctionOwnerStack.push('Client');
    }

    //let firstNode = nodeConverter.NodeNumber;
    GenerateCode(node.body);
    let firstNode = null;
    if (isServer) {
        firstNode = GetFirstFunctionNode(serverStack[serverStack.length - 1]);
    } else {
        firstNode = GetFirstFunctionNode(clientStack[clientStack.length - 1]);
    }

    let lastNodeJs = 'this.'+firstNode+'.apply(context);';
    let lastNode = (esprima.parseScript(lastNodeJs, {})).body[0];

    currentFunctionOwnerStack.pop();

    if (isServer){
        serverVariables.pop();
        let f = serverStack.pop();
        f.body.body.push(lastNode);
        return f;

    } else {
        clientVariables.pop();
        let f = clientStack.pop();
        f.body.body.push(lastNode);
        return f;
    }
}
function AddReturnOperations(node){
    if (node.argument === null){
        return;
    }
    let lastOperationsJS = `resolve(`+node.argument.name+`);`

    let lastOperation = (esprima.parseScript(lastOperationsJS, {})).body[0];
    //lastOperation.body[0].expression.arguments[0] = node.argument;
    AddNode(currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1], lastOperation);
    if (currentFunctionOwnerStack[currentFunctionOwnerStack.length - 1] === 'Server'){
        if (serverStack[serverStack.length - 1].params === null){
            serverStack[serverStack.length - 1].params = [];
        }
        serverStack[serverStack.length - 1].params.push(
            {
                "type": "Identifier",
                "name": "resolve"
            }
        );
    } else {
        clientStack[clientStack.length - 1].params = [
            {
                "type": "Identifier",
                "name": "resolve"
            }
        ];
    }
}

function IdentifierToThisProperty(id){
    let result = {
        "type": "MemberExpression",
        "computed": false,
        "object": {
            "type": "ThisExpression"
        },
        "property": {
            "type": "Identifier",
            "name": "md5"
        }
    };
    result.property = id;
    return result;
}

function UpdateFunctionExpressionArgs(node){

    let tmpNode = node;
    while(tmpNode.type !== 'Identifier'){
        if (tmpNode.type === 'MemberExpression'){
            tmpNode = tmpNode.object;
        } else if (tmpNode.type === 'CallExpression'){
            tmpNode = tmpNode.callee;
        }
    }
    let name = tmpNode.name;
    let isServer = IsNodeObject(name);
    if (!isServer) {
        isServer = currentFunctionOwnerStack.back() == 'Server';
    }

    if (node.type === 'CallExpression'){
        for (let i = 0; i < node.arguments.length; i++){
            if (node.arguments[i].type === 'ArrowFunctionExpression'
                || node.arguments[i].type === 'FunctionExpression'){
                let newNode = TraverseArrowFunctionReturnNode(node.arguments[i], isServer);
                node.arguments[i].body = newNode.body;
            } else if (node.arguments[i].type === 'Identifier'){
                node.arguments[i] = IdentifierToThisProperty(node.arguments[i]);
            } else if (node.arguments[i].type === 'ObjectExpression'){
                for (let j = 0; j < node.arguments[i].properties.length; j++){
                    if (node.arguments[i].properties[j].value.type === 'ArrowFunctionExpression'){
                        let newNode = TraverseArrowFunctionReturnNode(node.arguments[i].properties[j].value);
                        node.arguments[i].properties[j].value.body = newNode.body;
                    }
                }
            }

        }
        return UpdateFunctionExpressionArgs(node.callee);
    }
    if (node.type === 'MemberExpression'){
        return UpdateFunctionExpressionArgs(node.object);
    }
    return node;
}

function UpdateForInLoopBody(node) {
    let body = nodeConverter.GetEmptyFunctionBody(node);

    let isServer =IsNodeObject(node.right.name)
    if (isServer){
        serverVariables.push([]);
        serverStack.push(body);
        currentFunctionOwnerStack.push('Server');
    } else {
        clientVariables.push([]);
        clientStack.push(body);
        currentFunctionOwnerStack.push('Client');
    }
    //let firstNode = nodeConverter.NodeNumber;
    GenerateCode(node.body);
    let firstNode = null;
    if (isServer) {
        firstNode = GetFirstFunctionNode(serverStack[serverStack.length - 1]);
    } else {
        firstNode = GetFirstFunctionNode(clientStack[clientStack.length - 1]);
    }

    let lastNodeJs = 'this.'+firstNode+'.apply(context);';
    let lastNode = (esprima.parseScript(lastNodeJs, {})).body[0];

    currentFunctionOwnerStack.pop();

    let f = null;
    if (isServer){
        serverVariables.pop();
        f = serverStack.pop();
        f.body.body.push(lastNode);

    } else {
        clientVariables.pop();
        f = clientStack.pop();
        f.body.body.push(lastNode);
    }
    node.body = f.body;
    if (isServer){
        AddNode('Server', node);
    } else {
        AddNode('Client', node);
    }
}



function ProcessExpressionStatement(node){
    let type = ClassifyExpressionStatement(node);
    if (node.expression.type === 'CallExpression') {
        UpdateFunctionExpressionArgs(node.expression);
    }
    if (node.expression.type === 'AssignmentExpression'){
        if (node.expression.right.type === 'CallExpression'){
            UpdateFunctionExpressionArgs(node.expression.right);
        }
    }
    if (type === null){
        type = currentFunctionOwnerStack.back();
    } else {
        type = type ? 'Server' : 'Client';
    }
    if (type === 'Server'){
        AddNode(type, node);
    } else {
        AddNode(type, node);
    }
}

function Traverse( node){
    switch (node.type) {
        case 'ReturnStatement': {
            AddReturnOperations(node);
            return;
        }
        case 'ForInStatement': {
            UpdateForInLoopBody(node);
            return;
        }
        case 'ForStatement': {
            AddNode('Client', node);
            return;
        }
        case 'IfStatement':{
            AddNode(currentFunctionOwnerStack.back(), node);
            return;
        }
        case 'VariableDeclaration':{
            ClassifyVaribleDeclaration(node);
            return;
        }
        case 'ExpressionStatement':
        {
            ProcessExpressionStatement(node);
            return;
        }
        case 'FunctionDeclaration':{
            TraverseFunctionDeclaration(node);
            return;
        }
    }

    for (var key in node) {
        if (node.hasOwnProperty(key)) {
            var child = node[key];
            if (typeof child === 'object' && child !== null) {
                if (Array.isArray(child)) {
                    child.forEach(function(node) {
                        Traverse(node, Traverse);
                    });
                } else {
                    Traverse(child, Traverse);
                }
            }
        }
    }
}

function GenerateCode(tree){
    isLastNode.push(false);
    if (tree.body){
        for (let i = 0; i < tree.body.length; i++){
            if (i == tree.body.length - 1){
                isLastNode.setBack(true);
            }
            Traverse(tree.body[i]);
        }
    }
    isLastNode.pop();
}

if (process.argv.length !== 5){

    if (process.argv.length < 5) {
        console.log('Wrong command format. Please, set all arguments')
    } else {
        console.log('Wrong command format. Please, delete all extra arguments')
    }
} else {
    let fileName = process.argv[2];
    let clientFile = process.argv[3].split('=')[1];
    let serverFile = process.argv[4].split('=')[1];
    let program = fs.readFileSync(fileName, 'utf8');

    currentFunctionOwnerStack.push(null);
    GenerateCode(esprima.parseScript(program, {}));

    fs.writeFile(serverFile, escodegen.generate(serverStack[serverStack.length - 1]), function (err) {
        if (err) {
            console.log('Cannot save server code');
            return;
        };
        console.log('Server code saved!');
    });

    fs.writeFile(clientFile, escodegen.generate(clientStack[clientStack.length - 1]), function (err) {
        if (err) {
            console.log('Cannot save client code');
            return;
        };
        console.log('Client code saved!');
    });
}
