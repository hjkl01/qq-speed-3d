.PHONY: help serve dist deploy check

PROJECT ?= qq-speed-3d
DIST    := dist
SRC     := index.html css js vendor

help:
	@echo "make serve   本地预览（http://localhost:8080）"
	@echo "make dist    生成可部署的静态产物到 dist/"
	@echo "make deploy  构建并部署到 Cloudflare Pages（需要先 npx wrangler login）"
	@echo "make check   跑自动化自检（AI 跑完 3 圈 / 键盘手感 / 撞墙 / 弯道视线）"

serve:
	@echo "🌐 http://localhost:8080"
	@python3 -m http.server 8080 --bind 127.0.0.1

# 纯静态站点：产物 = 源码原样拷贝（无打包步骤）
dist:
	@rm -rf $(DIST)
	@mkdir -p $(DIST)
	@cp -R $(SRC) $(DIST)/
	@echo "✅ $(DIST)/ 就绪（$$(du -sh $(DIST) | cut -f1)）"

deploy: dist
	@npx wrangler pages project create $(PROJECT) --production-branch=main >/dev/null 2>&1 || true
	npx wrangler pages deploy $(DIST) --project-name $(PROJECT) --commit-dirty=true

check:
	node tools/laps.mjs
	node tools/feel.mjs
	node tools/wall.mjs
	node tools/camlook.mjs
