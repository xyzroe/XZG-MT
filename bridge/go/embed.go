package main

import (
	"embed"
	"io/fs"
	"path/filepath"
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
	
	// Try to read the file
	content, err := webFiles.ReadFile(filepath.Join("web", relPath))
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
