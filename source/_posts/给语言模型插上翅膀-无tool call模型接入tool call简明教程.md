---
title: 给语言模型插上翅膀
abbrlink: a2abf206
date: 2026-3-26 22:04:21
categories:
  - 技术笔记
tags:
  - LLM
  - litellm
  - tool call
summary: >-
  无tool call模型接入tool call简明教程。
---

# 0 引言
现在有些模型，例如反代出来的grok等，没有工具调用能力，这极大限制的了模型的能力，并给我们造成了相当大的困扰。如果要让他们可以调用工具，就又需要在代码部分做出一些变更。那么，我们是否可以寻找到一个中间件，能够在不修改业务代码的情况下，给这些模型接入tool call能力呢？这就是本文推荐使用的一个开源工具：litellm。

[litellm](https://github.com/BerriAI/litellm)是一个开源的LLM网关。这篇文章里主要使用了其工具转换功能。

# 1 环境准备
安装docker，教程略过。

# 2 准备配置
## 2.1 先在合适的地方创建一个目录，例如~/litellm-p，并cd进去。后续自行命令和文件写入默认工作目录为该目录

```bash
mkdir -p ~/litellm-p
cd ~/litellm-p
```

## 2.2 准备config.yaml（litellm配置）

将以下内容写入config.yaml:

```yaml
model_list:

# [1]
  - model_name: "grok-*" # [2]
    litellm_params:
      model: "openai/grok-*" # [3]
      api_key: "sk-..." # [4]
      api_base: "http(s)://.../v1" # [5]
      # 工具转换核心配置 [6]
      tool_choice_conversion: "to_system_prompt"
      drop_params: false
      stream: false
      complete_response: true

litellm_settings:
  # 全局开启输出解析，将模型生成的文本 JSON 转回 Tool Call 结构 [7]
  json_mode_with_tool_choice: true
```

[1]此处可以拦截一些不需要转换的模型。例如如果使用grok2api，生图模型不需要进行中转，可以在此处添加如下配置：

```yaml
  - model_name: "grok-imagine-*"
    litellm_params:
      model: "openai/grok-imagine-*"
      api_key: "sk-..."
      api_base: "http(s)://.../v1"
      drop_params: false
```

[2]此处可以填写具体要进行转换的模型名称。如果你不想一个个写，可以使用通配符（推荐，可以省很多麻烦），这种情况下模型名称会透传至下方对应的通配符位置，不用担心模型id错误

[3]此处填写对应模型名称，可以使用通配符。openai/前缀不可省略，用于标识请求格式，对实际id无影响

[4]填写上游密钥

[5]填写上游的OpenAI SDK Base URL

[6]这部分是核心配置，配置了工具调用转换相关功能。已经经过实践，可以照抄。stream和complete_response是为了减少奇奇怪怪的解析错误，上游也建议配置stream为false。drop_params为时候丢弃不支持参数，这里关闭以确保对请求的影响减小到最小

[7]来一层回程转换，以兼容OpenAI SDK

## 2.3 准备docker-compose.yaml
写入以下配置：

```yaml
services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: litellm-proxy #[8]
    ports:
      - "4000:4000"
    volumes:
      - ./config.yaml:/app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=sk-...  #[9]
    command: [ "--config", "/app/config.yaml", "--port", "4000" ]
    restart: always
```

[8]容器名字，可以随便取，比如ll-p-42

[9]请求该litellm所使用的api key

## 2.4 启动容器
运行：docker compose up -d

## 2.5 修改业务配置
代码不必修改，只需将base url改为litellm部署的位置，例如[url]http://127.0.0.1:4000/v1[/url] ，并将api key修改为刚才在docker-compose.yaml配置的即可。

# 3 结语
通过以上方法，使用了一个开源项目，我们成功的对一个请求进行了最小化改造，让他适配了我们基于OpenAI SDK的tool call架构。希望可以给各位读者一些启发。

> [此文章](https://forum.naixi.net/thread-10888-1-1.html)也为作者所写。