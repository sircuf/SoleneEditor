# workflows

main push 또는 수동 실행으로 Node.js 24에서 npm ci와 지정된 check·test·build를 실행해요. 성공한 dist만 Pages artifact로 올리고 별도 job의 Pages·OIDC 권한으로 배포해요.

저장소 Pages source는 GitHub Actions로 설정해 주세요. 기존 Vite의 상대 base를 사용해요. UI와 실제 앱 연결은 후속 wiring에서 맡아요.
