import * as vscode from "vscode";
import * as fs from "fs";
import { FileItem } from "./fileItem";
import path = require("path");

export class FileItemManager {
  parseUriIfString(uriOr: vscode.Uri | string): vscode.Uri {
    if (typeof uriOr === "string") {
      return vscode.Uri.parse(uriOr);
    }
    return uriOr;
  }

  isValidUri(uriOr: vscode.Uri | string | undefined): boolean {
    if (uriOr === undefined) {
      return false;
    }
    const uri = this.parseUriIfString(uriOr);
    const filePath = uri.fsPath;
    
    return fs.existsSync(filePath);
  }

  validateIfWin32Path(pathToCheck: string, scheme = '/'): vscode.Uri {
    const win32LocalDiskLabelArray = ['C','E','F','G','H','I','J','K','L','M','N'];
    
    let validatedPath = pathToCheck;
    if (process.platform === 'win32'
      && !win32LocalDiskLabelArray.some((v, i , _) => pathToCheck.startsWith(v)))
    {
      const pathArray = win32LocalDiskLabelArray.map((v, i, _) => {
        const realPath = `${v}:${pathToCheck}`;
        if (fs.existsSync(realPath)) {
          return realPath;
        }
      }).filter((v, i, _) => v !== undefined);
      
      validatedPath = pathArray.length > 0 ? pathArray[0] as string : pathToCheck;
    }
    const fixedPath = validatedPath.replace(/(^|[^\\])(\\+)(?=[^\\]|$)/g, '$1\\\\');
    validatedPath = fixedPath.startsWith(scheme) ? fixedPath : `${scheme}//${fixedPath}`;
    
    return vscode.Uri.parse(validatedPath);
  }

  createFileItem(uriOr: vscode.Uri | string): FileItem {
    const fspath = this.parseUriIfString(uriOr).fsPath;
    const uri = this.validateIfWin32Path(fspath);
    if (this.isValidUri(uri))
    {
      const label = path.basename(uri.fsPath);
      const isFile = fs.statSync(uri.fsPath).isFile();
      const collapsibleState = fs.statSync(uri.fsPath).isDirectory()
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      return new FileItem(label, collapsibleState, isFile, uri);
    }
    const label = path.basename(uri.fsPath);
    const isFile = true;
    const collapsibleState = vscode.TreeItemCollapsibleState.None;
    const newFileItem = new FileItem(label, collapsibleState, isFile, uri);
    newFileItem.description = "File not found";
    newFileItem.tooltip = `'${uri.fsPath}' was not found, click on Refresh icon for remove all invalid files from Just Files`;

    return newFileItem;
  }

  fileItemsFromPaths(paths: string[]): FileItem[] {
    return paths.map((path) => this.createFileItem(path));
  }

  getPathArray(fileItems: FileItem[]): string[] {
    const paths: string[] = fileItems
      .map((fileItem) => fileItem.resourceUri?.fsPath)
      .filter((fsPath): fsPath is string => fsPath !== undefined);

    return paths;
  }

  getSiblings(fileItem: FileItem): FileItem[] {
    const directoryPath = this.getParentUri(fileItem);
    if (!directoryPath) {
      return [];
    }
    const items: string[] = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .map((entry: fs.Dirent) => path.join(directoryPath, entry.name));

    const indexFileItem = items.findIndex((item) => item === fileItem.resourceUri?.fsPath);
    if (indexFileItem > -1) {
      items.splice(indexFileItem, 1);
    }

    return items.map((path) => this.createFileItem(path));
  }

  getParentInArray(fileItem: FileItem, parentFileItems: FileItem[]): FileItem | undefined {
    const resp = parentFileItems.filter((item) => this.isChildOf(fileItem, item));
    if (resp && resp.length > 0) {
      return resp[0];
    }
    return undefined;
  }

  getDirectoriesUntilParent(childPath: string, parentPath: string): string[] {
    const relativePath = path.relative(parentPath, childPath);
    const segments = relativePath.split(path.sep);

    const directories: string[] = [];
    let currentPath = parentPath;
    for (const segment of segments) {
      currentPath = path.join(currentPath, segment);
      directories.unshift(currentPath);
    }

    return directories;
  }

  isFileItemInArray(fileItem: FileItem, fileItemArray: FileItem[]): boolean {
    return fileItemArray.some((item) => item.resourceUri?.fsPath === fileItem.resourceUri?.fsPath);
  }

  isChildOf(childFileItem: FileItem, parentFileItem: FileItem): boolean {
    const childFileItemPath = childFileItem.resourceUri?.fsPath || "";
    const parentFileItemPath = parentFileItem.resourceUri?.fsPath || "";

    if (childFileItemPath === parentFileItemPath) {
      return false;
    }

    const relativePath = path.relative(parentFileItemPath, childFileItemPath);

    return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  }

  isChildOfArray(childFileItem: FileItem, parentFileItems: FileItem[]): boolean {
    return parentFileItems.some((item) => this.isChildOf(childFileItem, item));
  }

  isParentOfArray(parentFileItem: FileItem, childrenFileItems: FileItem[]): boolean {
    return childrenFileItems.some((item) => this.isChildOf(item, parentFileItem));
  }

  sortItems(items: FileItem[]) {
    return items.sort((a, b) => {
      const labelA = a.resourceUri?.fsPath.toLocaleLowerCase();
      const labelB = b.resourceUri?.fsPath.toLocaleLowerCase();

      if (labelA && labelB) {
        if (a.isFile && !b.isFile) {
          return 1;
        } else if (!a.isFile && b.isFile) {
          return -1;
        }
        return labelA.localeCompare(labelB);
      }

      return 0;
    });
  }

  private getParentUri(fileItem: FileItem): string | undefined {
    if (fileItem.resourceUri) {
      const filePath = fileItem.resourceUri.fsPath;
      const parentPath = path.dirname(filePath);
      return parentPath;
    }

    return undefined;
  }
}
