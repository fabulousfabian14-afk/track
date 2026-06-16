$token = Read-Host -AsSecureString 'Enter GitHub Personal Access Token'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
$body = @{name='kabianga-university'; description='University of Kabianga Lost and Track System'; private=$false} | ConvertTo-Json
try {
    Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers @{Authorization='token ' + $plain; 'User-Agent'='PowerShell'; Accept='application/vnd.github+json'} -Body $body -ContentType 'application/json'
    Write-Host 'GitHub repository created successfully.'
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
