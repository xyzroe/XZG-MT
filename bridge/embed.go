package main

import (
	"embed"
	"path"
	"strings"
)

//go:embed web/*
var webFiles embed.FS

// getEmbeddedFile returns the content of an embedded file if it exists
func getEmbeddedFile(relPath string) (string, bool) {
	// Remove leading slash
	relPath = strings.TrimPrefix(relPath, "/")

	// Default to index.html
	if relPath == "" {
		relPath = "index.html"
	}

	// Normalize path separators - embed.FS always uses forward slashes
	relPath = strings.ReplaceAll(relPath, "\\", "/")

	// Use path.Join instead of filepath.Join for embed.FS
	// embed.FS always uses forward slashes regardless of OS
	embeddedPath := path.Join("web", relPath)

	// Try to read the file
	content, err := webFiles.ReadFile(embeddedPath)
	if err != nil {
		return "", false
	}

	return string(content), true
}
