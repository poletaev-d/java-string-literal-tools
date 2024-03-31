'use strict';

const vscode = require('vscode');
const ast = require('java-ast');
const tree = require('antlr4ts/tree');
const { JavaParser } = require('java-ast/dist/parser/JavaParser');
const { Interval } = require("./Interval");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('java-string-literal-tools.copy-literals', copyLiterals));
  context.subscriptions.push(vscode.commands.registerCommand('java-string-literal-tools.paste-as-literals', pasteAsLiterals));
}

function copyLiterals() {
  const extensionConfig = getExtensionConfig();
  const editor = vscode.window.activeTextEditor;
  const text = editor.document.getText();
  const selection = new Interval(
    editor.document.offsetAt(editor.selection.start),
    editor.document.offsetAt(editor.selection.end));

  const parsedCode = ast.parse(text);
  const leafs = getAllLeafs(parsedCode);

  let nodesToCopy = [];

  if (selection.end - selection.start <= 1) {
    let selectedStringLiteral = leafs.find(
      node => node instanceof tree.TerminalNode
        && node.symbol.type == JavaParser.STRING_LITERAL
        && selection.intersects(new Interval(node.symbol.startIndex + 1, node.symbol.stopIndex)));
    
    if (selectedStringLiteral != null) {
      nodesToCopy = pullConcatenationList(selectedStringLiteral.parent.parent.parent);
    }
  
  } else {
    nodesToCopy = leafs.filter(
      node => node instanceof tree.TerminalNode
        && node.symbol.type == JavaParser.STRING_LITERAL
        && selection.intersects(new Interval(node.symbol.startIndex + 1, node.symbol.stopIndex)));
  }

  if (nodesToCopy.length > 0) {
    let textToCopy = '';

    
    for (let i = 0; i < nodesToCopy.length; ++i) {
      let currentNode = nodesToCopy[i];
      let nextNode = i < nodesToCopy.length - 1 ? nodesToCopy[i + 1] : null;
      let singleLeaf = currentNode;
      while (singleLeaf.children != null && singleLeaf.children.length == 1) {
        singleLeaf = singleLeaf.children[0];
      }

      let isStringLiteral = singleLeaf instanceof tree.TerminalNode
        && singleLeaf.symbol.type == JavaParser.STRING_LITERAL
        && singleLeaf.text.length > 0;
      
      let nodeText = isStringLiteral ? JSON.parse(singleLeaf.text) : currentNode.text;
      if (nextNode == null) {
        nodeText = processLineBreak(nodeText, extensionConfig.copyToClipboard.lineBreakHandling, false);
      } else if (nextNode.start.line > currentNode.stop.line) {
        nodeText = processLineBreak(nodeText, extensionConfig.copyToClipboard.lineBreakHandling, true);
      }
      textToCopy += nodeText;
    }
    
    if (textToCopy.length > 0) {
      vscode.env.clipboard.writeText(textToCopy).then(() => {
          vscode.window.showInformationMessage(nodesToCopy.length == 1
            ? 'String literal value is copied to clipboard'
            : 'String literal concatenation is copied to clipboard');
        });
    } else {
      vscode.window.showWarningMessage('String literal value is empty');
    }
  } else {
    vscode.window.showWarningMessage('No string literal is selected');
  }
}

function pasteAsLiterals() {
  const extensionConfig = getExtensionConfig();
  const editor = vscode.window.activeTextEditor;
  const text = editor.document.getText();
  const selection = new Interval(
    editor.document.offsetAt(editor.selection.start),
    editor.document.offsetAt(editor.selection.end));
  
  vscode.env.clipboard.readText().then(str => {
    if (str == null || str.length == 0) {
      vscode.window.showWarningMessage('Clipboard is empty');
      return;
    }

    const parsedCode = ast.parse(text);
    const leafs = getAllLeafs(parsedCode);
    let startLiteral = leafs.find(
      node => node instanceof tree.TerminalNode
        && node.symbol.type == JavaParser.STRING_LITERAL
        && selection.start >= node.symbol.startIndex + 1 && selection.start <= node.symbol.stopIndex);
    
    let endLiteral = leafs.find(
      node => node instanceof tree.TerminalNode
        && node.symbol.type == JavaParser.STRING_LITERAL
        && selection.end >= node.symbol.startIndex + 1 && selection.end <= node.symbol.stopIndex);
    
    let rawLines = str.split("\n");
    for (let i = 0; i < rawLines.length - 1; ++i) {
      rawLines[i] = processLineBreak(rawLines[i] + "\n", extensionConfig.pasteFromClipboard.lineBreakHandling, true);
    }
    let escapedLines = rawLines.filter(s => s.length > 0).map(s => JSON.stringify(s));
    
    if (startLiteral != null) {
      escapedLines[0] = escapedLines[0].substring(1, escapedLines[0].length);
    }

    if (endLiteral != null) {
      let s = escapedLines[escapedLines.length - 1];
      escapedLines[escapedLines.length - 1] = s.substring(0, s.length - 1);
    }
    let result = escapedLines.join("\n+ ");
    editor.edit(editBuilder => editBuilder.replace(editor.selection, result));
    vscode.commands.executeCommand('editor.action.formatSelection');
  });
}


/** 
 * @param {ast.ParseTree} node Root node
 * @return {[ast.ParseTree]} All leaf nodes in {@link node}
 */
function getAllLeafs(node) {
  let arr = [];
  if (node.children == null || node.children.length == 0) {
    arr = [node];
  } else {
    for (let nn of node.children) {
      arr = arr.concat(getAllLeafs(nn));
    }
  }

  return arr;
}

/** 
 * @param {ast.ParseTree} node
 * @return {boolean} true if {@link node} contains concatenation of 2 other nodes
 */
function isConcatenationNode(node) {
  return node != null && node.children != null
    && node.children.length == 3
    && node.children[1] instanceof tree.TerminalNode
    && node.children[1].symbol.type == JavaParser.ADD;
}

/** 
 * If {@link rootNode} contains concatenation of multiple nodes, returns all that nodes without ADD symbols.
 * Otherwise returns {@link rootNode} itself
 * @param {ast.ParseTree} rootNode
 * @return {[ast.ParseTree]} array of nodes in concatenation
 */
function pullConcatenationListFromRoot(rootNode) {
  if (isConcatenationNode(rootNode)) {
    let left = pullConcatenationListFromRoot(rootNode.children[0]);
    let right = pullConcatenationListFromRoot(rootNode.children[2]);
    return left.concat(right);
  } else {
    return [rootNode];
  }
}

/** 
 * If {@link node} is part of concatenation, then returns all nodes in this concatenation
 * Otherwise returns {@link node} itself
 * @param {ast.ParseTree} node
 * @return {[ast.ParseTree]} array of nodes in concatenation
 */
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

function getExtensionConfig() { 
  return vscode.workspace.getConfiguration('stringLiteralToolsForJava');
}

function processLineBreak(text, lineBreakHandlingMode, forceAppend) {
  if (text == null) {
    return text;
  }
  if (lineBreakHandlingMode === '\n'
    || lineBreakHandlingMode === '\r\n'
    || lineBreakHandlingMode === 'remove') {
  
    let lineBreakChars = lineBreakHandlingMode;
    if (lineBreakHandlingMode === 'remove') { 
      lineBreakChars = '';
    }
    const eolCrlf = '\r\n';
    const eolLf = '\n';
    const eolCr = '\r';
    if (text.endsWith(eolCrlf)) {
      return text.substring(0, text.lastIndexOf(eolCrlf)) + lineBreakChars;
    } else if (text.endsWith(eolLf)) {
      return text.substring(0, text.lastIndexOf(eolLf)) + lineBreakChars;
    } else if (text.endsWith(eolCr)) {
      return text.substring(0, text.lastIndexOf(eolCr)) + lineBreakChars;
    } else if (forceAppend) { 
      return text + lineBreakChars;
    }
    return text;

  }
  return text;
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
