package strava

import (
    "bytes"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "os"
    "path/filepath"
)

// UploadFitFile reads a local .fit file and uploads it to the Strava API
func UploadFitFile(accessToken string, filePath string) error {
    file, err := os.Open(filePath)
    if err != nil {
        return fmt.Errorf("failed to open .fit file: %v", err)
    }
    defer file.Close()

    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)

    part, err := writer.CreateFormFile("file", filepath.Base(filePath))
    if err != nil {
        return fmt.Errorf("failed to create form file: %v", err)
    }
    io.Copy(part, file)

    writer.WriteField("data_type", "fit")
    writer.Close()

    req, err := http.NewRequest("POST", "https://www.strava.com/api/v3/uploads", body)
    if err != nil {
        return err
    }

    req.Header.Set("Authorization", "Bearer "+accessToken)
    req.Header.Set("Content-Type", writer.FormDataContentType())

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return fmt.Errorf("request to strava failed: %v", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated {
        respBody, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("strava API error (status %d): %s", resp.StatusCode, string(respBody))
    }

    return nil
}