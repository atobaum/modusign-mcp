# modusign-mcp

모두싸인(Modusign) 전자계약 서비스를 위한 MCP(Model Context Protocol) 서버입니다.
Claude Desktop, Claude Code, n8n, Codex 등 MCP를 지원하는 모든 환경에서 전자계약 기능을 사용할 수 있습니다.

> **API 문서**: https://developers.modusign.co.kr

## 기능

- **33개 MCP Tool** — 서명 요청, 라벨/템플릿/웹훅 관리, 파일 다운로드/병합, 유저/구독 조회 등
- **자동 Rate Limit 처리** — 429 응답 시 자동 재시도 (최대 3회)
- **범용 MCP 호환** — stdio transport로 모든 MCP 클라이언트 지원
- **TypeScript** — 타입 안전성 보장

## 설치 및 설정

### 방법 1: .mcpb 번들 (권장)

[mcpbundles.com](https://www.mcpbundles.com) 또는 릴리즈 페이지에서 `modusign-mcp.mcpb` 파일을 다운로드한 후 Claude Desktop에서 한 번에 설치할 수 있습니다.
설치 시 이메일, API Key, Base URL을 입력하는 UI가 자동으로 표시됩니다.

### 방법 2: npx (Claude Desktop / Claude Code)

#### Claude Desktop

`claude_desktop_config.json`에 아래 내용을 추가하세요:

```json
{
  "mcpServers": {
    "modusign": {
      "command": "npx",
      "args": ["-y", "modusign-mcp"],
      "env": {
        "MODUSIGN_EMAIL": "your@email.com",
        "MODUSIGN_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Claude Code

프로젝트 루트의 `.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "modusign": {
      "command": "npx",
      "args": ["-y", "modusign-mcp"],
      "env": {
        "MODUSIGN_EMAIL": "your@email.com",
        "MODUSIGN_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 방법 3: 로컬 빌드 (개발용)

```bash
git clone <repo>
cd modusign-mcp
npm install
npm run build

# Claude Desktop 설정에서 command/args를 아래로 변경:
# "command": "node"
# "args": ["/absolute/path/to/modusign-mcp/dist/index.js"]
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `MODUSIGN_EMAIL` | ✅ | 모두싸인 계정 이메일 |
| `MODUSIGN_API_KEY` | ✅ | 모두싸인 API KEY (`설정 → API → API KEY`) |
| `MODUSIGN_BASE_URL` | ❌ | API Base URL (기본값: `https://api.modusign.co.kr`) |

## 파일 입력 방식

`document_create`, `document_create_embedded_draft` 등 파일이 필요한 tool은 세 가지 방식을 지원합니다:

| 방식 | 예시 | 설명 |
|------|------|------|
| **filePath** (권장) | `{ "filePath": "/Users/me/contract.pdf" }` | 로컬 파일 경로로 직접 업로드 |
| **BASE64** | `{ "type": "BASE64", "base64": "...", "fileName": "contract.pdf" }` | Base64 인코딩된 파일 내용 |
| **FILE_REF** | `{ "type": "FILE_REF", "value": { "fileId": "...", "token": "..." } }` | 이미 업로드된 파일 참조 |

> **Claude Desktop 파일 드래그 주의**: 드래그 시 표시되는 `/mnt/user-data/uploads/...` 경로는 가상 경로입니다.
> 실제 파일 경로(`/Users/이름/Downloads/파일명.pdf`)를 직접 입력하거나 BASE64 모드를 사용하세요.
> (filePath 사용 시 shell fallback으로 자동 재시도합니다.)

## 서명 방식 (signingMethod)

| type | value | 설명 |
|------|-------|------|
| `EMAIL` | 이메일 주소 | 이메일로 서명 링크 발송 |
| `KAKAO` | 전화번호 (예: `01012345678`) | 카카오톡으로 서명 링크 발송 |
| `SECURE_LINK` | 이메일 또는 전화번호 | 보안 URL 직접 생성 (임베디드 서명에 사용) |

## 사용 가능한 Tool 목록

### 문서 (20개)

| Tool | 설명 |
|------|------|
| `document_list` | 서명 문서 목록 조회 (상태/제목/날짜/라벨 필터, 정렬 지원) |
| `document_get` | 문서 상세 정보 조회 |
| `document_create` | 새 서명 요청 생성 (filePath/BASE64/FILE_REF, carbonCopies 지원) |
| `document_create_from_template` | 템플릿으로 서명 요청 생성 (carbonCopies 지원) |
| `document_create_embedded_draft` | 임베디드 초안 생성 |
| `document_create_embedded_draft_from_template` | 템플릿으로 임베디드 초안 생성 |
| `document_cancel` | 서명 요청 취소 (ON_GOING/SCHEDULED 상태만 가능) |
| `document_remind` | 서명 알림 재전송 |
| `document_request_correction` | 서명 내용 수정 요청 |
| `document_change_due_date` | 서명 유효기간 변경 |
| `document_update_metadata` | 문서 메타데이터 변경 |
| `document_manage_labels` | 문서에 라벨 추가/제거 (`action: "add" \| "remove"`) |
| `document_get_history` | 문서 이력 조회 |
| `document_get_requester_inputs` | 요청자 입력 정보 조회 |
| `document_get_participant_fields` | 서명자 입력란 조회 |
| `document_get_attachments` | 첨부파일 조회 |
| `document_forward` | 완료된 문서 전달 (이메일/전화) |
| `document_get_embedded_view` | 임베디드 문서보기 URL 조회 |
| `document_get_signing_url` | 서명자 보안 링크 조회 (SECURE_LINK 방식 전용) |
| `document_download` | 문서 PDF를 로컬 파일시스템에 저장 |

### 템플릿 (6개)

| Tool | 설명 |
|------|------|
| `template_list` | 템플릿 목록 조회 |
| `template_get` | 템플릿 상세 정보 조회 (참여자 역할·입력 필드 포함) |
| `template_create_embedded` | 임베디드 템플릿 생성 URL 조회 |
| `template_delete` | 템플릿 삭제 |
| `template_update_metadata` | 템플릿 메타데이터 변경 |
| `template_get_embedded_view` | 임베디드 템플릿보기 URL 조회 |

### 라벨 (1개)

| Tool | 설명 |
|------|------|
| `label_manage` | 라벨 CRUD 통합 (`action: "list" \| "create" \| "update" \| "delete"`) |

### 파일 (1개)

| Tool | 설명 |
|------|------|
| `file_merge` | 여러 PDF FILE_REF(fileId+token) 병합 |

### 웹훅 (1개)

| Tool | 설명 |
|------|------|
| `webhook_manage` | 웹훅 CRUD 통합 (`action: "list" \| "get" \| "create" \| "update" \| "delete"`) |

### 유저 / 유틸리티 (4개)

| Tool | 설명 |
|------|------|
| `user_get_me` | 현재 인증된 사용자 정보 조회 |
| `user_get_subscription` | 구독 정보 조회 |
| `user_get_usage` | 사용량 조회 (`from`, `to` ISO 8601 날짜 필수) |
| `health_check` | MCP 서버 상태 및 API 인증 확인 |

## 사용 예시

```
최근 서명 문서 목록 보여줘
```

```
진행 중인(ON_GOING) 서명 문서들만 조회해줘
```

```
/Users/me/Downloads/contract.pdf 파일로 김모두(kim@example.com)에게 서명 요청해줘
```

```
010-1234-5678로 카카오톡 서명 요청 보내줘
```

```
템플릿 목록을 보여주고, 근로계약서 템플릿으로 김모두(kim@example.com)에게 서명 요청해줘
```

```
doc_12345 문서를 취소해줘
```

```
2026년 2월 사용량 조회해줘
```

## 문서 상태

| 상태 | 설명 |
|------|------|
| `DRAFT` | 초안 |
| `SCHEDULED` | 예약됨 |
| `ON_GOING` | 서명 진행 중 |
| `ON_PROCESSING` | 처리 중 |
| `PROCESSING_FAILED` | 처리 실패 |
| `ABORTED` | 취소됨 |
| `COMPLETED` | 완료됨 |

## Rate Limit

| 구분 | 분당 | 초당 |
|------|------|------|
| 일반 API | 300 | 10 |
| 고비용 API (목록 조회, 서명 요청, 파일 업로드) | 150 | 5 |

429 응답 시 `X-Retry-After` 헤더 기반으로 자동 재시도합니다 (최대 3회).

## 라이선스

MIT
