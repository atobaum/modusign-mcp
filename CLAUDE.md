# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # TypeScript 컴파일 → dist/
npm run dev     # watch 모드 (tsc --watch)
npm start       # dist/index.js 직접 실행
```

테스트 프레임워크 없음. 동작 확인은 `.mcp.json` 설정 후 MCP 클라이언트에서 직접 호출.

## Architecture

stdio transport 기반 MCP 서버. `src/index.ts`가 진입점으로 환경변수 검증 → `ModusignClient` 인스턴스 생성 → 4개 tool 모듈 등록 → `StdioServerTransport` 연결 순으로 초기화된다.

```
src/
  index.ts                  # 진입점: env 검증, McpServer + StdioServerTransport
  client/
    modusign-client.ts      # HTTP 클라이언트 (auth, 429 retry, OData filter)
  utils/
    errors.ts               # ModusignApiError
  tools/
    documents.ts            # 16개 tool
    templates.ts            # 2개 tool
    files.ts                # 2개 tool
    user.ts                 # 1개 tool
```

### Tool 등록 패턴

각 tool 모듈은 `register*Tools(server, client)` 함수를 export하며 내부에서 `server.tool(name, description, zodSchema, handler)` 형태로 등록한다. Zod 스키마가 MCP 클라이언트에 노출되는 JSON Schema로 변환된다.

### ModusignClient

- `Authorization: Basic {base64(email:apiKey)}` 인증
- 429 응답 시 `X-Retry-After` → `Retry-After` → `'1'` 순으로 헤더 참조, 최대 3회 자동 재시도
- `buildODataFilter()` 정적 메서드로 document_list의 `$filter` 파라미터 생성
- `postFormData()` 메서드: FormData를 넘기면 Content-Type 헤더를 자동으로 omit (브라우저가 multipart boundary 자동 설정)

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `MODUSIGN_EMAIL` | ✅ | 모두싸인 계정 이메일 |
| `MODUSIGN_API_KEY` | ✅ | 모두싸인 API KEY |
| `MODUSIGN_BASE_URL` | ❌ | API Base URL (기본값: `https://api.modusign.co.kr`) |

## 주요 API 제약사항 (라이브 테스트 확인)

- **`document_get_signing_url`**: `SECURE_LINK` 방식 참여자 전용. EMAIL/KAKAO 방식에 호출하면 422 반환.
- **SECURE_LINK `value`**: 빈 문자열 불가, 이메일 또는 전화번호 필수.
- **`document_create_from_template`의 `role`**: 템플릿에 정의된 역할명과 정확히 일치해야 함.
- **`template_list` limit 파라미터**: 반드시 number 타입으로 전달 (string 전달 시 MCP SDK 검증 오류).

## 빌드 결과물

`dist/` 디렉터리는 `.gitignore`에 포함되어 있으므로 배포 전 `npm run build` 필요. npm publish 시 `files: ["dist"]` 설정으로 dist만 포함된다.
