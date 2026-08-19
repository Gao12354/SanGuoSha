# 这是由2026OIer ~~(AIer)~~ 们制作的 ~~冒牌~~ 三国杀 #

## 一.优点 ##

1.无任何氪金内容！

2.完全仿照三国杀制作!

3.不仅有AI，还有真人PVP!

## 二.游玩方法 ##

服务器还没建好,只能自己部署在本地了,尽快修复.

## 三.自己部署 ##
### 1.安装 JS 环境 ###
访问Node.js官网 <https://nodejs.org/zh-cn>,全默认即可下载.msi文件后安装(最好记一下安装目录备用).

安装完成后最好重启,更新一下Path

输入以下命令检验安装是否成功
~~~ bash
node -v
~~~
预期的输出(大致如此):
~~~ bash
v24.19.0
~~~
输出不一致? 像这样？
~~~ bash
node : 无法将“node”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。请检查名称的拼写，如果包括路径，请确保路径正确
，然后再试一次。
所在位置 行:1 字符: 1
+ node -v
+ ~~~~
    + CategoryInfo          : ObjectNotFound: (node:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
~~~
右键`计算机` -> `属性` -> `高级系统设置` -> `环境变量` -> 双击`Path` -> `新建` -> 把刚才的安装目录末尾加 `\bin` 输入
### 2.下载游戏 ### 
在GitHub界面点击`Releases`中最新的版本,下载`.zip`的压缩包，并在本地解压.
### 3.运行！ ###
打开解压后的文件夹

打开`PowerShell`分别输入以下命令,使得能看到`server.js`:
~~~ bash
cd "你解压的文件夹 如:C:\Users\Name\Desktop\SanGuoSha"
npm init -y
npm install ws
node server.js
~~~
__恭喜你!成功完成!__
