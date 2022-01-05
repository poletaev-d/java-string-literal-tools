// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
'use strict';

const vscode = require('vscode');
const ast = require('java-ast');
const tree = require('antlr4ts/tree');
const { LiteralContext } = require('java-ast');
const parser = require('java-ast/dist/parser/JavaParser');
var ncp = require("copy-paste");


const Interval = function (start, end) {
  if (start > end) {
      throw start + " > " + end;
  }
  this.start = start;
  this.end = end;
}

Interval.prototype.intersects = function (other) {
  return this.start <= other.start && this.end >= other.end
    || this.start >= other.start && this.start <= other.end
    || this.end >= other.start && this.end <= other.end;
}
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  let disposable = vscode.commands.registerCommand('java-string-literal-tools.copy-literals', function () {
    
    const editor = vscode.window.activeTextEditor;
    const text = editor.document.getText();
    const selection = new Interval(
      editor.document.offsetAt(editor.selection.start),
      editor.document.offsetAt(editor.selection.end));

    const parsedCode = ast.parse(text);
    const leafs = getAllLeafs(parsedCode);

    let selectedStringLiteral = leafs.find(
      node => node instanceof tree.TerminalNode
        && node.symbol.type == parser.JavaParser.STRING_LITERAL
        && selection.intersects(new Interval(node.symbol.startIndex + 1, node.symbol.stopIndex)));
    
    let copiedLiteralsCount = 0;
    let copiedText = null;
    
    if (selectedStringLiteral != null) {
      let list = pullConcatenationList(selectedStringLiteral.parent.parent.parent);
      if (!editor.selection.isEmpty) {
        list = list.filter(node => selection.intersects(new Interval(node.start.startIndex + 1, node.stop.stopIndex)));
      }
      let result = '';

      for (let n of list) {
        let singleLeaf = n;
        while (singleLeaf.children != null && singleLeaf.children.length == 1) {
          singleLeaf = singleLeaf.children[0];
        }
        if (singleLeaf instanceof tree.TerminalNode && singleLeaf.symbol.type == parser.JavaParser.STRING_LITERAL) {
          result += stringLiteralToString(singleLeaf.text);
        } else {
          result += n.text;
        }
      }

      copiedLiteralsCount = list.length;
      copiedText = result;
    }

    if (copiedLiteralsCount > 0) {
      ncp.copy(copiedText,
        () => {
          vscode.window.showInformationMessage(copiedLiteralsCount == 1
            ? 'String literal value is copied to clipboard'
            : 'String literals concatenation is copied to clipboard');
        });
    } else {
      vscode.window.showInformationMessage('No string literal is selected');
    }

	});

	context.subscriptions.push(disposable);
}

function getAllLeafs(node) {
  let arr = [];
  if (node.children != null) {
    for (let nn of node.children) {
      arr = arr.concat([nn], getAllLeafs(nn));
    }
  }

  return arr;
}

function stringLiteralToString(literal) {
  let result;
  if (literal.length > 0) {
    result = JSON.parse(literal);
  } else {
    result = literal;
  }

  return result;
}

function isConcatenationNode(node) {
  return node != null && node.children != null
    && node.children.length == 3
    && node.children[1] instanceof tree.TerminalNode
    && node.children[1].symbol.type == parser.JavaParser.ADD;
}

function pullConcatenationListFromRoot(rootNode) {
  if (isConcatenationNode(rootNode)) {
    let left = pullConcatenationListFromRoot(rootNode.children[0]);
    let right = pullConcatenationListFromRoot(rootNode.children[2]);
    return left.concat(right);
  } else {
    return [rootNode];
  }
}

function pullConcatenationList(node) {
  let list = [];
  if (!isConcatenationNode(node.parent)) {
    list.push(node);
  } else {
    let concatenationNode = node;
    while (isConcatenationNode(concatenationNode.parent)) {
      concatenationNode = concatenationNode.parent;
    }
    list = pullConcatenationListFromRoot(concatenationNode);
  }

  return list;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
