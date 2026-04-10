# `@tsonic/express`

Native Tsonic source-of-truth implementation of Express.

## Current phase

This repo is the canonical native package for `@tsonic/express`.

The initial slice in this repo ports the host-independent core:

- router pipeline
- route chaining
- mount/export behavior
- param handlers
- application settings and render hooks
- core response helpers

The remaining host-bound substrate (`listen`, transport/file adapters, multipart/filesystem hooks) lives in the same canonical package.
