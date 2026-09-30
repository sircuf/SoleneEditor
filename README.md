# SoleneEditor

RisuAI의 `.charx`, `.risum`, 로어북 `.json` 파일을 브라우저에서 텍스트 기반으로 편집하는 도구예요.

- 설치 없이 웹에서 바로 쓰는 정적 사이트예요. 지금은 개발 중이라 배포하지 않았어요. 로컬에서 실행해 주세요.
- 파일은 서버로 전송되지 않고 브라우저 안에서만 처리돼요.
- 카드·모듈·로어북·정규식·트리거를 폼이나 항목별 JSON으로 편집해요.
- 작업을 브라우저에 자동 저장하고, 스냅샷으로 이전 상태를 복원해요.
- 가져온 에셋과 알 수 없는 필드를 보존해 원래 형식으로 내보내요. 에셋 자체는 편집하지 않아요.

## 개발과 실행

Node.js 24에서 `npm install`로 의존성을 설치해요.

```sh
npm run dev
```

출력된 로컬 주소를 열면 실제 편집기를 사용할 수 있어요. 같은 주소의 `/src/dev/preview.html`을 열면 메모리 샘플을 사용하는 UI 미리보기가 나와요. 미리보기 옵션은 [src/dev/README.md](src/dev/README.md)에 있어요.

```sh
npm run check
npm test
npm run build
```

각각 타입·Svelte 검사, 전체 테스트, 정적 사이트 빌드를 실행해요. 빌드 결과는 `dist/`에 생기고 상대 경로(`base: './'`)로 GitHub Pages 하위 경로에서도 열려요. 통합 테스트 범위는 [tests/integration/README.md](tests/integration/README.md)에 있어요.

진행 상황은 [STATUS.md](STATUS.md), 개요는 [docs/OVERVIEW.md](docs/OVERVIEW.md), 작업 방식은 [docs/WORKFLOW.md](docs/WORKFLOW.md)를 보세요.

## 라이선스

AGPL-3.0
