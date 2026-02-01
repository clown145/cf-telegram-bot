import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "cache_from_url",
  version: "1.0.0",
  name: "从 URL 缓存文件",
  description: "下载文件并缓存到 R2，返回本地路径。",
  category: "io",
  tags: ["cache", "download", "r2"],
  inputs: [
    {
      name: "url",
      type: "string",
      required: true,
      description: "要下载的文件 URL。",
    },
    {
      name: "filename",
      type: "string",
      required: false,
      description: "可选文件名（留空则自动生成）。",
    },
    {
      name: "no_cache",
      type: "boolean",
      required: false,
      default: true,
      description: "是否为下载 URL 禁用缓存（破解缓存）。",
    },
  ],
  outputs: [
    {
      name: "file_path",
      type: "string",
      description: "缓存后的本地路径。",
    },
  ],
  i18n: {
    name: { "zh-CN": "从 URL 缓存文件", "en-US": "Cache From URL" },
    description: { "zh-CN": "下载文件并缓存到 R2，返回本地路径。", "en-US": "Download file to R2 and return local path." },
    inputs: {
      url: {
        label: { "zh-CN": "下载地址", "en-US": "URL" },
        description: { "zh-CN": "要下载的文件 URL。", "en-US": "File URL to download." },
      },
      filename: {
        label: { "zh-CN": "文件名", "en-US": "Filename" },
        description: { "zh-CN": "可选文件名（留空自动生成）。", "en-US": "Optional filename (auto when empty)." },
      },
      no_cache: {
        label: { "zh-CN": "禁用源缓存", "en-US": "Disable Source Cache" },
        description: { "zh-CN": "自动为下载 URL 追加随机参数以绕过源服务器或 CDN 缓存。", "en-US": "Add a random query param to the URL to bypass source or CDN caching." },
      },
    },
    outputs: {
      file_path: {
        label: { "zh-CN": "文件路径", "en-US": "File Path" },
        description: { "zh-CN": "缓存后的本地路径。", "en-US": "Cached local path." },
      },
    },
  },
  ui: {
    icon: "download",
    color: "#34d399",
    group: "IO",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: true,
    requiredBindings: ["FILE_BUCKET"],
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
