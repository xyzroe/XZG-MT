package main

import (
	"embed"
	"io/fs"
	"path"
	"strings"
)

//go:embed web/*
var webFiles embed.FS

// getEmbeddedFile returns the content of an embedded file if it exists
func getEmbeddedFile(relPath string) (string, bool) {
	// Remove leading slash
	if strings.HasPrefix(relPath, "/") {
		relPath = relPath[1:]
	}

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

// listEmbeddedFiles returns a list of all embedded files
func listEmbeddedFiles() []string {
	var files []string

	fs.WalkDir(webFiles, "web", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if !d.IsDir() {
			// Remove "web/" prefix
			relPath := strings.TrimPrefix(path, "web/")
			files = append(files, relPath)
		}

		return nil
	})

	return files
}
