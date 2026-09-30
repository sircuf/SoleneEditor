# 작업 방식

## 역할

- **사용자**: 방향과 우선순위를 정하고, 외부에 공개하거나 되돌리기 어려운 작업을 승인해요.
- **감독자 (Claude Code)**: 설계, 작업 지시서 작성, 코드 리뷰, 검증을 맡아요. 사용자가 명시적으로 맡기지 않는 한 구현과 통합은 하지 않아요.
- **구현 에이전트 (Codex)**: 담당 폴더 안에서 구현해요. 계약(`src/contracts/`)은 읽기만 해요.
- **통합 에이전트 (Codex)**: 브랜치 병합의 판단(충돌 해결), 앱 연결, 통합 테스트, 통합 중에 발견한 수정을 맡아요.

판단이 거의 필요 없는 작은 작업은 위임하면 오히려 손해예요. 그런 경우 감독자가 "직접 처리할까요?" 하고 먼저 물어봐요.

## 진행 단계

1. **계약 먼저**: 레이어 사이의 타입과 진입점을 `src/contracts/`에 확정하고 리뷰해요. 병렬 작업은 계약만 보고 진행해요.
2. **병렬 구현**: 에이전트마다 git worktree와 브랜치를 따로 두고, 담당 폴더만 수정해요.
3. **리뷰**: 감독자가 커밋되지 않은 변경을 리뷰해요. 확인 항목은 `npm run check`, `npm test`, `npm run build`, 계약 준수, 담당 폴더 밖 수정 여부, 가까운 문서 갱신이에요. 통과하면 감독자가 해당 브랜치에 커밋해요.
4. **통합**: 통합 에이전트가 병합과 연결을 하고, 감독자가 리뷰한 뒤 실제 브라우저에서 확인해요.

## Codex 세션 운용 (Windows)

- `codex exec resume <세션ID>`로 이어서 지시해요. 지시서는 영어로 쓰고, 문서와 UI 문구는 한국어 해요체로 쓰게 해요.
- **"already has an active writer" 오류**: Codex 데스크톱 앱이 그 세션을 붙잡고 있다는 뜻이에요. 창만 닫아서는 안 되고, 앱을 완전히 종료하거나 재부팅해야 풀려요.
- **샌드박스는 `.git`에 쓰지 못해요.** `writable_roots`에 `.git`을 넣어도 막혀요. 그래서 이렇게 나눠요.
  - Codex는 파일 작업과 읽기 전용 git 명령만 해요.
  - 감독자는 Codex가 요청한 `git merge`, `git add`, `git commit`만 대신 실행하고, 파일 내용은 건드리지 않아요.
- worktree에서 실행할 때는 그 폴더로 이동한 뒤 `-c sandbox_workspace_write.writable_roots=["<worktree>"]`를 줘요.
- npm 캐시와 임시 파일은 저장소 밖에 두게 해요.

## 로컬 실행과 검증

```bash
npm run dev
```

- 실제 앱은 dev 서버 루트(`/`)에서 확인해요. `index.html` 수준의 문제는 미리보기 페이지에서 드러나지 않으니, UI를 바꾸면 **반드시 루트 페이지로도 확인**해요.
- 목업 데이터 미리보기: `/src/dev/preview.html?doc=charx|risum|lorebook|book|empty&theme=light|dark&dirty`
- 커밋 전에는 `npm run check`, `npm test`, `npm run build`를 모두 통과시켜요.

## RisuAI 호환성 확인

1. `kwaroran/RisuAI`를 저장소 **밖**에 clone하고 `pnpm install --frozen-lockfile --ignore-scripts`로 설치해요.
2. RisuAI 폴더가 있는 드라이브에서 dev 서버를 실행해요. 다른 드라이브에서 실행하면 wasm 경로 문제로 실패해요.
3. 테스트용 로컬 인스턴스에서는 환경 변수 `VITE_RISU_LEGAL_CONFIGURED=TRUE`를 써요. RisuAI 안내문에 테스트·개발 목적이면 허용된다고 되어 있어요. 약관 동의는 사용자 승인을 받은 뒤에 눌러요.
4. 브라우저에서 RisuAI 모듈(`exportCharacterCard`, `exportModuleLegacy`, `readModule`, `importCharacterProcess` 등)을 동적 import해서 파일을 만들거나 읽어요.
5. 결과는 `tests/fixtures/real/`에 넣고, 만든 방법을 `tests/fixtures/README.md`에 적어요.

## git과 공개

- 원격 저장소는 `origin` = `https://github.com/sircuf/SoleneEditor`(공개)예요.
- 커밋 이메일은 GitHub noreply 주소(`336020535+sircuf@users.noreply.github.com`)예요. 저장소 로컬 설정에 들어 있어요. 개인 이메일로 커밋하지 않아요.
- GitHub CLI는 `C:\Program Files\GitHub CLI\gh.exe`에 있고, `sircuf` 계정으로 로그인돼 있어요.

## 배포

완성하기 전에는 배포하지 않아요([STATUS.md](../STATUS.md#배포-상태)). 사용자가 완성이라고 하면 이 순서로 다시 켜요.

```bash
gh workflow enable "Deploy GitHub Pages" -R sircuf/SoleneEditor
```
```bash
gh api -X POST repos/sircuf/SoleneEditor/pages -f build_type=workflow
```

그다음 `main`에 push하거나 워크플로우를 실행하고, 배포된 주소(`https://sircuf.github.io/SoleneEditor/`)를 직접 열어서 확인해요.
