# Portfolio Release Checklist

## Product
- [ ] Main user journey works without manual database edits
- [ ] Validation and permission failures produce useful messages
- [ ] Mobile and desktop layouts are usable
- [ ] Demo data is safe and reproducible

## Backend
- [ ] Database migrations are committed
- [ ] OpenAPI/Swagger reflects current endpoints
- [ ] Core domain rules are tested
- [ ] API integration tests cover happy and negative paths
- [ ] No secrets or real credentials are present

## Frontend
- [ ] Production build passes
- [ ] Lint/test checks pass
- [ ] Loading, empty, error, and success states are intentional
- [ ] Forms are labeled and keyboard-usable
- [ ] API errors are handled consistently

## QA evidence
- [ ] Postman collection is included
- [ ] Manual test cases cover the main workflow
- [ ] At least two realistic bug reports demonstrate reporting quality
- [ ] Regression cases exist for fixed defects

## GitHub presentation
- [ ] README has problem, stack, architecture, setup, screenshots, tests, and trade-offs
- [ ] Repository topics/description are concise
- [ ] CI badges are current
- [ ] PR history demonstrates scoped development
- [ ] Commit history has no generated noise or secrets
- [ ] `v1.0.0` release is tagged

## Interview readiness
- [ ] Can explain why React state is structured as implemented
- [ ] Can explain one Tailwind responsive design decision
- [ ] Can trace one request from React -> API -> application logic -> EF Core -> PostgreSQL
- [ ] Can explain authentication and authorization difference in this app
- [ ] Can explain unit vs integration vs manual/API testing used here
- [ ] Can explain one rejected design alternative and its trade-off
