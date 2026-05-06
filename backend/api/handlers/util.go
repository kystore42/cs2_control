package handlers

import (
	"crypto/sha256"
	"fmt"
	"strings"
)

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum)
}

func isDuplicateKey(err error, column string) bool {
	return err != nil && strings.Contains(err.Error(), "unique") && strings.Contains(err.Error(), column)
}
