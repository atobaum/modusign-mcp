# modusign-mcp

모두싸인(Modusign) 전자계약 서비스를 위한 MCP(Model Context Protocol) 서버입니다.
Claude Desktop, Claude Code, n8n, Codex 등 MCP를 지원하는 모든 환경에서 전자계약 기능을 사용할 수 있습니다.

> **API 문서**: https://developers.modusign.co.kr

## 기능

- **41개 MCP Tool** — 서명 요청, 라벨/템플릿/웹훅 관리, 파일 업로드, 유저/구독 조회 등
- **자동 Rate Limit 처리** — 429 응답 시 자동 재시도 (최대 3회)
- **범용 MCP 호환** — stdio transport로 모든 MCP 클라이언트 지원
- **TypeScript** — 타입 안전성 보장

## 설치 및 설정

### 1. API KEY 발급

모두싸인 서비스에서 `설정 → API → API KEY` 메뉴에서 API KEY를 발급받으세요.

### 2. Claude Desktop 설정

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

### 3. Claude Code 설정

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

### 4. 로컬 빌드로 실행 (개발용)

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
| `MODUSIGN_API_KEY` | ✅ | 모두싸인 API KEY |
| `MODUSIGN_BASE_URL` | ❌ | API Base URL (기본값: `https://api.modusign.co.kr`) |

## 사용 가능한 Tool 목록

### 문서 (20개)

| Tool | 설명 |
|------|------|
| `document_list` | 서명 문서 목록 조회 (상태/제목/날짜/라벨 필터, 정렬 지원) |
| `document_get` | 문서 상세 정보 조회 |
| `document_create` | 새 서명 요청 생성 (PDF base64 또는 file_upload 결과 사용) |
| `document_create_from_template` | 템플릿으로 서명 요청 생성 |
| `document_create_embedded_draft` | 임베디드 초안 생성 |
| `document_create_embedded_draft_from_template` | 템플릿으로 임베디드 초안 생성 |
| `document_cancel` | 서명 요청 취소 |
| `document_remind` | 서명 알림 재전송 |
| `document_request_correction` | 서명 내용 수정 요청 |
| `document_change_due_date` | 서명 유효기간 변경 |
| `document_update_metadata` | 문서 메타데이터 변경 |
| `document_add_label` | 문서에 라벨 추가 |
| `document_remove_label` | 문서에서 라벨 제거 |
| `document_get_history` | 문서 이력 조회 |
| `document_get_requester_inputs` | 요청자 입력 정보 조회 |
| `document_get_participant_fields` | 서명자 입력란 조회 |
| `document_get_attachments` | 첨부파일 조회 |
| `document_forward` | 완료된 문서 전달 (이메일/전화) |
| `document_get_embedded_view` | 임베디드 문서보기 URL 조회 |
| `document_get_signing_url` | 서명자 보안 링크 조회 (SECURE_LINK 방식) |

### 템플릿 (6개)

| Tool | 설명 |
|------|------|
| `template_list` | 템플릿 목록 조회 |
| `template_get` | 템플릿 상세 정보 조회 |
| `template_create_embedded` | 임베디드 템플릿 생성 URL 조회 |
| `template_delete` | 템플릿 삭제 |
| `template_update_metadata` | 템플릿 메타데이터 변경 |
| `template_get_embedded_view` | 임베디드 템플릿보기 URL 조회 |

### 라벨 (4개)

| Tool | 설명 |
|------|------|
| `label_list` | 라벨 목록 조회 |
| `label_create` | 라벨 생성 |
| `label_update` | 라벨 수정 |
| `label_delete` | 라벨 삭제 |

### 파일 (2개)

| Tool | 설명 |
|------|------|
| `file_upload` | 파일 업로드 (base64 → multipart 변환, 2시간 유효) |
| `file_merge` | 여러 PDF 파일 병합 |

### 웹훅 (5개)

| Tool | 설명 |
|------|------|
| `webhook_list` | 웹훅 목록 조회 |
| `webhook_create` | 웹훅 생성 |
| `webhook_get` | 웹훅 상세 조회 |
| `webhook_update` | 웹훅 수정 |
| `webhook_delete` | 웹훅 삭제 |

### 유저 / 유틸리티 (4개)

| Tool | 설명 |
|------|------|
| `user_get_me` | 현재 인증된 사용자 정보 조회 |
| `user_get_subscription` | 구독 정보 조회 |
| `user_get_usage` | 사용량 조회 |
| `health_check` | MCP 서버 상태 및 API 인증 확인 (API KEY 오류 시 안내) |

## 사용 예시

Claude에서 다음과 같이 사용할 수 있습니다:

```
최근 서명 문서 목록 보여줘
```

```
진행 중인(ON_GOING) 서명 문서들만 조회해줘
```

```
템플릿 목록을 보여주고, 근로계약서 템플릿으로 김모두(kim@example.com)에게 서명 요청해줘
```

```
doc_12345 문서를 취소해줘. 사유는 "내용 수정 후 재발송 예정"
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

## Roadmap

현재 미구현 항목이 없습니다. ([API 문서](https://developers.modusign.co.kr/reference) 기준)

## 라이선스

MIT
