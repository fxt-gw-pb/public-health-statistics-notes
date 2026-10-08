# 公卫统计 · 学习笔记

[在线阅读](https://fxt-gw-pb.github.io/public-health-statistics-notes/)

应用线性回归、应用多元分析、广义线性模型三份学习总笔记的完整网页阅读版。共 **17 章讲解、12 组习题、348 道习题及解析、2 个勘误附录**，对应原 PDF 共 568 页。

| 课程 | 讲解 | 习题 | 原笔记 |
| --- | ---: | ---: | ---: |
| 应用线性回归 | 5 章 | 160 道 | 195 页 |
| 应用多元分析 | 4 章 | 95 道 | 147 页 |
| 广义线性模型 | 8 章 | 93 道 | 226 页 |

## 学习功能

- 首页提供散点回归、主成分投影和 Logistic 曲线三种动态统计图示，可切换或暂停；系统减少动态效果时默认暂停。
- 左侧课程栏可收起或展开，收起偏好保存在当前浏览器。
- 按原书顺序阅读，使用本章目录定位知识点；在讲解与对应习题间切换。
- 搜索全部笔记，可按课程筛选；支持 `⌘K` / `Ctrl+K` 和键盘选取结果。
- 公式使用 KaTeX 排版，统计图由原始 TikZ 源码渲染，保留原有表格、代码及运行输出。
- 逐题展开解析，标记已掌握；复制代码到自己的 R 环境使用。
- 200 道选择题支持点击选项作答和保存选择。183 道按明确的原解析判分；5 道保留原解析中的条件或歧义提示；12 道原文、图表或答案待核实的题只记录选择，不编造对错。
- 收藏章节、标记已读、继续上次阅读，支持 16–22 px 正文字号。
- 适配电脑和手机，提供三份原 PDF 下载。

学习进度、收藏、已掌握题目和字号只保存在当前浏览器的 `localStorage`，无需登录。不同设备或浏览器之间不会自动同步；清理浏览器数据会清除这些记录。

## 本地运行

需要 Node.js 22.12 或更新版本，推荐 Node.js 24。

```sh
npm ci
npm run dev
```

```sh
python3 scripts/verify_content.py
node scripts/check_math.mjs
node scripts/check_interactions.mjs
npm run build
npm run preview
```

网页使用相对资源路径与哈希路由，可在 GitHub Pages 的仓库子路径下直接刷新或分享章节链接。所有公式字体、正文、图片及 PDF 都随站点一起发布，无需依赖外部 CDN。

## 目录与内容更新

```text
src/                  网页界面、阅读样式和公式处理
notes/                三门课程最终 LaTeX 正文、宏与配图
public/data/          已转换的 31 份章节数据、目录及搜索索引
public/figures/       原图渲染结果与原笔记配图
public/pdfs/          三份原始总笔记 PDF
scripts/              内容导入、配图渲染和完整性检查
.github/workflows/    自动构建及 GitHub Pages 发布
```

直接修改界面后提交到 `main` 即会自动发布。修改笔记正文时，先同步 `notes/<课程>/content/` 中对应的 `.tex` 文件，然后重新转换：

```sh
python3 scripts/import_notes.py
python3 scripts/verify_content.py
node scripts/check_math.mjs
```

内容转换需要 Pandoc。若修改了 TikZ 统计图，再运行 `python3 scripts/render_figures.py`，它需要 XeLaTeX、Poppler 和 Pillow。`notes/<课程>/references.json` 保留原书引用编号；正文编号或标签变化时应根据新编译的 `main.aux` 更新。原 PDF 可替换 `public/pdfs/` 中对应文件。

正文基于 2026-10-06 的最终总笔记，网页整理于 2026-10-08。保留原笔记的解释、限定条件、习题答案和勘误；网页转换没有重新执行原书的统计分析代码。原书中有关考试安排的文字属于历史笔记内容。

模板自身的许可保留于 `notes/common/LICENSE.txt`。
