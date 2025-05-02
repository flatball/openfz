# OpenFZ base de código aberto do Flatball

## Pré-requisitos

Para rodar localmente ou em uma VPS (servidor privado virtual), você precisará dos seguintes componentes instalados:

#### Node.js
- Como instalar:
    - Windows/MacOS: [Download](https://nodejs.org/pt)

    - Android através do [Termux](https://nodejs.org/pt):
        ```
        pkg install nodejs
        ```

    - Linux (base Debian):
        ```
        curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ```

#### Git (para clonar o repositório)
- Como instalar:
    ```
    sudo apt-get install git  # Linux
    ```

## Instalação e configuração

#### Ambiente de desenvolvimento

### 1. Obtenha nosso código fonte
```
git clone https://github.com/flatball-volcam/openfz.git
cd openfz
```

### 2. Instale as dependências
Na pasta raiz do projeto, execute:
```
npm install
```
Isso instalará todos os pacotes necessários listados no `package.json`

## Executando o jogo
```
node server.js
```
Assim o jogo estará disponível **localmente**. O terminal exibirá o link qual deverá usar.

#### Ambiente de produção

### 1.  Recomendamos que utilizem PM2:
```
npm install -g pm2
pm2 start server.js --name "openfz"
```

### 2. Para manter o processo ativo após logout:
```
pm2 startup
pm2 save
```

## Configuração da VPS

### 1. Firewall
Libere a porta padrão do jogo
```
sudo ufw allow 3000
sudo ufw enable
```

### 2. Nginx como proxy reverso 
Primeiramente instale:
```
sudo apt install nginx
```

Crie um arquivo de configuração em /etc/nginx/sites-available/openfz:
```
server {
    listen 80;
    server_name openfz.com.br; // Exemplo

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ative o site:
```
sudo ln -s /etc/nginx/sites-available/openfz /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl restart nginx
```

### 3. Certificado SSL (HTTPS)
Use o Certbot para obter certificado:
```
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

## Atualizando o Jogo
1. Pare o processo:
```
pm2 stop openfz
```
2. Atualize os arquivos
3. Reinstale as dependências se necessário:
```
npm install
```
4. Inicie novamente:
```
pm2 start openfz
```