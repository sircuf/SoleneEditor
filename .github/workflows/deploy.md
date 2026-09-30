# deploy.yml

main push와 수동 실행을 받아요. build job에서 의존성 설치와 check·test·build를 완료한 뒤 dist를 Pages artifact로 업로드해요. deploy job은 build에 의존하고 GitHub Pages 환경에 배포 URL을 기록해요.

일반 권한은 contents:read로 제한하고 배포 job에만 pages:write와 id-token:write를 줘요. pages 동시 실행 그룹을 사용하고 진행 중인 배포를 취소하지 않아요. 저장소 Pages source는 GitHub Actions로 설정해야 해요.
