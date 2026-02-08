.PHONY: test

TEST_FILES := $(wildcard tests/test_*.js)

test:
	@exit_code=0; \
	for f in $(TEST_FILES); do \
		echo "——— $$f ———"; \
		node "$$f" || exit_code=1; \
		echo; \
	done; \
	exit $$exit_code
