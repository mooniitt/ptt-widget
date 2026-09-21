#!/usr/bin/env bash

# ==========================================================
# PTT Widget 快捷工作流脚本
# 用法:
#   ./run.sh                 - 默认执行打包构建 + 自动化测试
#   ./run.sh build           - 仅打包编译 traffic_widget_loader.min.js
#   ./run.sh test            - 运行全尺寸自动化测试套件
#   ./run.sh push "提交说明"  - 打包、测试通过后自动 Git 提交并推送
# ==========================================================

set -e

# 颜色输出定义
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

# 切换到项目根目录
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

do_build() {
  echo -e "${BLUE}${BOLD}==> [1/2] 正在打包构建 traffic_widget_loader.min.js ...${RESET}"
  node build.js
}

do_test() {
  echo -e "\n${BLUE}${BOLD}==> [2/2] 正在运行全尺寸自动化测试套件 ...${RESET}"
  node test.js
}

do_push() {
  local MSG="${1:-update widget scripts}"
  do_build
  do_test
  echo -e "\n${BLUE}${BOLD}==> 正在提交并推送到 GitHub ...${RESET}"
  git add ptt_widget.js ptt_widget_small.js ptt_widget_medium.js ptt_widget_large.js build.js package.json test.js run.sh .gitignore
  if git diff --cached --quiet; then
    echo -e "${YELLOW}没有检测到需要提交的代码改动。${RESET}"
  else
    git commit -m "$MSG"
    git push origin main
    echo -e "${GREEN}${BOLD}🎉 成功推送到 GitHub main 分支！${RESET}"
  fi
}

show_help() {
  echo -e "${BOLD}PTT Widget 快捷操作指南:${RESET}"
  echo -e "  ${GREEN}./run.sh${RESET}               执行打包构建并运行自动化测试"
  echo -e "  ${GREEN}./run.sh build${RESET}         仅执行 Loader 打包与压缩"
  echo -e "  ${GREEN}./run.sh test${RESET}          仅运行各尺寸小组件测试套件"
  echo -e "  ${GREEN}./run.sh push \"说明\"${RESET}   打包、测试通过后自动 Git 提交并推送"
  echo -e "  ${GREEN}./run.sh help${RESET}          查看帮助说明"
}

ACTION="${1:-all}"

case "$ACTION" in
  build)
    do_build
    ;;
  test)
    do_test
    ;;
  push)
    do_push "$2"
    ;;
  help|-h|--help)
    show_help
    ;;
  all|"")
    do_build
    do_test
    echo -e "\n${GREEN}${BOLD}✨ 全部操作顺利完成！${RESET}"
    ;;
  *)
    echo -e "${RED}未知命令: $ACTION${RESET}\n"
    show_help
    exit 1
    ;;
esac
