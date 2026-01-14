# openYuanRong 开源版本看板

## 需求

1. 从gitcode获取openeuler组织下的yuanrong、yuanrong-functionsystem、yuanrong-datasystem、ray-adapter、yuanrong-frontend这几个仓库的PR、issue
2. 提供一个网页看板，展示以上仓库的issue、PR信息，还包括添加责任人、责任组、备注、预期解决时间、是否要同步内部仓库（同步的话自动创建issue）、优先级、到期时间、超期天数等自定义字段
3. 目前该项目是我个人开发，后期团队内的同事可能会一起加入

## 技术方案

我个人的技术栈：
- 容器，操作系统
- golang、rust


前端：
我对前端基本毫无了解，你能帮我规划使用哪套解决方案么？vite？nextjs？

后端：
为了通用性，选择golang吧

## API

### GitCode

文档：https://docs.gitcode.com/docs/apis/