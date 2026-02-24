# Tool Design — 설계 의도

## 핵심 원칙

MCP 툴은 LLM이 의도를 자연스럽게 매핑할 수 있어야 한다.
툴이 많을수록 LLM이 올바른 툴을 고르기 어렵고, 툴 간 차이가 파라미터 하나뿐이라면 하나로 합치는 것이 낫다.

---

## 통폐합 이력

### 1. `label_manage` (4개 → 1개)

**이전**: `label_list`, `label_create`, `label_update`, `label_delete`

**이후**: `label_manage(action: "list" | "create" | "update" | "delete")`

**이유**: 단순 CRUD 패턴. 엔드포인트도 `/labels`, `/labels/{id}` 두 개뿐이라 action 분기가 자연스럽다.
LLM 입장에서 "라벨 만들어줘" → `label_manage(action: "create")` 로 명확하게 연결된다.

---

### 2. `webhook_manage` (5개 → 1개)

**이전**: `webhook_list`, `webhook_get`, `webhook_create`, `webhook_update`, `webhook_delete`

**이후**: `webhook_manage(action: "list" | "get" | "create" | "update" | "delete")`

**이유**: label과 동일한 CRUD 패턴. webhooks는 사용 빈도가 낮아 별도 툴로 노출할 필요가 없다.

---

### 3. `document_manage_labels` (2개 → 1개)

**이전**: `document_add_label`, `document_remove_label`

**이후**: `document_manage_labels(documentId, labelId, action: "add" | "remove")`

**이유**: 같은 엔드포인트(`/documents/{id}/labels/{labelId}`)에 POST/DELETE만 다르다.
파라미터도 동일하므로 action 하나로 분기하는 것이 명확하다.

---

### 4. `template_get_fields` 제거 (1개 → 0개)

**이전**: `template_get_fields(templateId)` — template_get 응답을 재파싱해서 roles/fields만 추출

**이후**: `template_get` description에 "participantMappings에 사용할 role 이름과 requesterInputMappings에 사용할 dataLabel 확인 가능"을 명시

**이유**: 동일한 API 엔드포인트(`GET /templates/{id}`)를 두 번 호출하는 중복.
LLM은 `template_get` 응답에서 필요한 필드를 직접 파싱할 수 있으므로 별도 툴이 불필요하다.

---

### 5. `document_create` + `document_create_from_template` 통합 (2개 → 1개)

**이전**:
- `document_create(title, file, participants, ...)` → `POST /documents`
- `document_create_from_template(templateId, document)` → `POST /documents/request-with-template`

**이후**: `document_create(title, file?, templateId?, ...)`
- `templateId` 있으면 → 템플릿 기반 (`/documents/request-with-template`)
- `file` 있으면 → 파일 기반 (`/documents`)

**이유**: "서명 요청 보내줘"라는 동일한 의도를 두 가지 다른 툴로 나눌 이유가 없다.
파일이냐 템플릿이냐는 파라미터로 자연스럽게 전달된다.

---

### 6. `document_create_embedded_draft` + `document_create_embedded_draft_from_template` → `document_create(embedded: true)` (3개 → 0개)

**이전**:
- `document_create_embedded_draft(title, file, ...)` → `POST /embedded-drafts`
- `document_create_embedded_draft_from_template(templateId, document, ...)` → `POST /embedded-drafts/create-with-template`

**이후**: `document_create(..., embedded: true)`

**이유**: embedded draft는 서명 요청 생성의 "편집 모드" 변형일 뿐이다.
최종 목적(서명 요청 생성)은 동일하고, 중간에 iframe 편집 단계가 끼어드는 차이만 있다.
`embedded: true` 파라미터 하나로 이 의도를 명확히 표현할 수 있다.

---

## 현재 툴 목록 (30개)

| 카테고리 | 툴 | 비고 |
|----------|----|------|
| 문서 | `document_list` | |
| | `document_get` | |
| | `document_create` | embedded, templateId, file 분기 |
| | `document_cancel` | |
| | `document_remind` | |
| | `document_request_correction` | |
| | `document_change_due_date` | |
| | `document_update_metadata` | |
| | `document_manage_labels` | add/remove 통합 |
| | `document_get_history` | |
| | `document_get_requester_inputs` | |
| | `document_get_participant_fields` | |
| | `document_get_attachments` | |
| | `document_forward` | |
| | `document_get_embedded_view` | |
| | `document_get_signing_url` | SECURE_LINK 전용 |
| | `document_download` | PDF 로컬 저장 |
| 템플릿 | `template_list` | |
| | `template_get` | roles/fields 포함 |
| | `template_create_embedded` | |
| | `template_delete` | |
| | `template_update_metadata` | |
| | `template_get_embedded_view` | |
| 라벨 | `label_manage` | CRUD 통합 |
| 파일 | `file_merge` | |
| 웹훅 | `webhook_manage` | CRUD 통합 |
| 유저 | `user_get_me` | |
| | `user_get_subscription` | |
| | `user_get_usage` | |
| | `health_check` | |

---

## 통합하지 않은 것들

- **`document_get_*` 시리즈**: history, requester_inputs, participant_fields, attachments, embedded_view, signing_url — 각각 목적이 다르고 응답 구조도 달라 통합하면 오히려 혼란스럽다.
- **`template_create_embedded`**: `/embedded-drafts`를 쓰지만 `mode=create-template` URL 변환 로직이 있고, templates.ts에 위치해 문서 생성과 개념적으로 다르다.
- **`user_*` 시리즈**: 각각 다른 엔드포인트, 다른 목적. 통합 시 응답 구조가 달라져 혼란 유발.
