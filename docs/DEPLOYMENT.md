# IDENTEE — Deploying to the server

A step-by-step guide for putting identee.co.in live on the company's own server. Every command is typed **on the
server** (after logging in with SSH) unless it says "on your laptop". Do the steps in order; each one says how to
check it worked.

**The picture:** Nginx is the front door (HTTPS, the website's files, and forwarding `/api` to the backend); PM2
keeps the backend (Node + Express) running; the database (MongoDB Atlas), pictures (Cloudinary), email (Zoho) and
payments (Razorpay) stay where they are.

```
customer → https://identee.co.in → Nginx ─┬─ /api/…  → Express (PM2, port 3001) → Atlas / Cloudinary / Razorpay / AI
                                          └─ the rest → frontend/dist (the built website)
```

## 0. Before you start — what you need

| What | From |
|---|---|
| Your SSH login: a **sudo** user with your public key, the server's **IP**, your **user name**, the **SSH port** | Your boss |
| **OS** (these steps are for Ubuntu) and at least **2 GB RAM** | Your boss |
| What else runs on it (other sites, Nginx/Apache, used ports, Node version) | Your boss |
| Access to the **DNS** of identee.co.in (GoDaddy) — or someone who changes it on launch day | The owner |
| Ports **80** and **443** open on the firewall | Your boss |
| The values for `server/.env` (Atlas, Cloudinary, Zoho, Razorpay **live**, Gemini…) | You (from your laptop's `.env` and the dashboards) |

In the commands below, replace `vinith` with your user name and `SERVER-IP` with the server's address.

## 1. Log in

On your laptop:

```bash
ssh vinith@SERVER-IP
```

(With another port: `ssh -p 2222 vinith@SERVER-IP`.) You're in when the prompt shows `vinith@…:~$`.

## 2. Install what the site needs

**Look first** — if your boss's server already has some of these, don't reinstall them:

```bash
node -v; nginx -v; git --version; pm2 -v
```

- `node -v` shows `v22.x` → Node is ready. Shows another version (16, 18, 20) used by your boss's apps → install
  Node 22 *beside* it with nvm (2a), so his apps keep their version. Shows "not found" → 2a too.
- Nginx already there → skip installing it in 2b, and in step 6 you only **add** a new file (never edit his).

**2a. Node 22 with nvm** (only if needed):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Close the connection (`exit`), log in again, then:

```bash
nvm install 22 && nvm alias default 22 && node -v
```

**2b. Nginx, git, and the libraries Chrome needs for invoice PDFs:**

```bash
sudo apt update && sudo apt install -y nginx git
```

```bash
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2
```

(On Ubuntu 24.04, if `libasound2` is "not found", use `libasound2t64` instead.)

**2c. PM2:**

```bash
npm install -g pm2
```

Check: `node -v` shows v22, `nginx -v` and `pm2 -v` show versions.

## 3. Get the code

```bash
cd ~ && git clone https://github.com/vinith-codes/Identee.git identee && cd identee && git log --oneline -1
```

You now have `~/identee` with the latest main. (The repo is public, so no key is needed. If it is made private
later, the server needs a "deploy key": `ssh-keygen -t ed25519 -f ~/.ssh/identee_deploy`, add the `.pub` in GitHub →
Repo → Settings → Deploy keys, read-only.)

## 4. The backend

**4a. Libraries:**

```bash
cd ~/identee/server && npm ci --omit=dev
```

**4b. Chrome for the invoice PDFs** (Puppeteer):

```bash
npx puppeteer browsers install chrome
```

**4c. The settings file.** Make it from the template, then fill in every line marked REQUIRED:

```bash
cp .env.example .env && nano .env
```

- Make a new `JWT_SECRET` (don't reuse the laptop's):

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

- `PORT=3001` — if another app already uses 3001 (`sudo ss -tlnp | grep 3001` shows something), pick a free one
  and use the same number in step 6.
- Razorpay: the **live** keys go here, and only here.
- Save in nano: **Ctrl+O**, **Enter**, then **Ctrl+X**.
- Protect it: `chmod 600 .env`

**4d. Let the server reach the database.** In MongoDB Atlas → **Network Access** → **Add IP Address** → the server's
IP. (Recommended: a **separate live database** in Atlas, so the laptop's test orders stay out of it — then put
its address in `MONGO_URI`.)

**4e. Try it** (it runs in front of you; stop it with **Ctrl+C**):

```bash
node server.js
```

Good: `Server running in production mode on port 3001`, `MongoDB Connected`, `Mailer connected and ready`. A
`CORS_ORIGIN is not set` warning means step 4c isn't finished.

## 5. Keep the backend running (PM2)

```bash
cd ~/identee/server && pm2 start ecosystem.config.cjs && pm2 save
```

Make it start again after the server restarts — this prints one command; **copy and run that command**:

```bash
pm2 startup
```

Check: `pm2 status` shows `identee` as **online**. Logs: `pm2 logs identee` (Ctrl+C to leave).

## 6. The website and Nginx

**6a. Build the website:**

```bash
cd ~/identee/frontend && cp .env.production.example .env.production && npm ci && npm run build
```

This makes `frontend/dist` — the files Nginx gives to customers.

**6b. Let Nginx read your folders** (Nginx runs as its own user):

```bash
chmod o+x /home/vinith /home/vinith/identee /home/vinith/identee/frontend
```

**6c. Add the site to Nginx.** Copy the settings, and check the two things in it — the `root` path (your user name)
and the port (3001, or the one you chose):

```bash
sudo cp ~/identee/deploy/nginx-identee.conf /etc/nginx/sites-available/identee && sudo nano /etc/nginx/sites-available/identee
```

```bash
sudo ln -s /etc/nginx/sites-available/identee /etc/nginx/sites-enabled/identee
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must say **syntax is ok / test is successful**. Your boss's other sites are untouched: this only adds a
new file.

**6d. Test before the domain points here** (the site answers for its name, so we send the name ourselves):

```bash
curl -s -H "Host: identee.co.in" http://127.0.0.1/ | head -5
```

```bash
curl -s -H "Host: identee.co.in" http://127.0.0.1/api/settings/public | head -c 200
```

The first shows HTML (`<!doctype html>…`), the second shows the shop's settings as JSON.

## 7. Point the domain here (DNS)

In GoDaddy → My Products → identee.co.in → **DNS**. **Take a screenshot of everything first.** Then:

| Record | Change to |
|---|---|
| `A` · name `@` | the server's IP |
| `A` · name `www` (or `CNAME www` → `identee.co.in`) | the server's IP |

**Don't touch** the email records: `MX`, `TXT` with `v=spf1`, the Zoho/DKIM ones, `_dmarc` — or email stops working.

It spreads in 10 minutes to a few hours. Check from your laptop: `nslookup identee.co.in` shows the server's IP.
Then `http://identee.co.in` opens the shop (not secure yet).

## 8. HTTPS (the padlock)

Only after step 7 works (Let's Encrypt checks the domain points here):

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d identee.co.in -d www.identee.co.in
```

Give the shop's email, agree, and choose to **redirect** HTTP to HTTPS. Certbot renews it by itself every few
months. Check: `https://identee.co.in` shows the padlock.

## 9. Firewall

Only if your boss's server uses `ufw` (`sudo ufw status`). Keep SSH open **first**, or you lock yourself out:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw status
```

Port 3001 stays closed to the internet (only Nginx, inside the server, talks to it).

## 10. Razorpay webhook (after the site is live)

Razorpay dashboard (live mode) → **Webhooks** → Add:
- URL: `https://backend.identee.co.in/api/orders/razorpay/webhook` (the live backend has its own address)
- Events: `payment.captured` and `order.paid`
- Make a secret, put the **same** secret in `server/.env` as `RAZORPAY_WEBHOOK_SECRET`, then `pm2 restart identee`.

## 11. Final checks

- [ ] Home page, a collection, the Design Room (3D tee turns), Find my size
- [ ] Log in with a real email (the code arrives — check spam the first time)
- [ ] Upload a photo in the Design Room (tests the 25 MB limit and Cloudinary)
- [ ] Admin → Orders → open an order → **Invoice** → Download PDF (tests Chrome)
- [ ] A **small real payment** (₹1–10 product, or a real order you then cancel and refund from Razorpay)
- [ ] Admin → Settings: shop name, logo, contact details are right
- [ ] `pm2 logs identee` shows no red errors

## Updating the live site later

On your laptop: merge into main and push, as usual. Then on the server:

```bash
bash ~/identee/deploy/deploy.sh
```

(Run it with `bash`, not with `chmod +x`: changing the file's permission on the server would make git see it as
changed and could block the next `git pull`.)

It pulls main, installs libraries, builds the website into a new folder and swaps it in only when the build worked,
then restarts the backend. If a step fails it stops, and the old site keeps running.

Changed only `server/.env`? Then just `pm2 restart identee --update-env`.

## Going back to the previous version

The website files from before the last update are kept in `frontend/dist-old`:

```bash
cd ~/identee/frontend && mv dist dist-broken && mv dist-old dist
```

For the backend, go back one commit and restart:

```bash
cd ~/identee && git log --oneline -5
```

```bash
git checkout <the-good-commit-id> && cd server && npm ci --omit=dev && pm2 restart identee
```

Fix the problem on your laptop, push, then `git checkout main` on the server and run `deploy.sh` again.

## When something goes wrong

| You see | Likely cause | Fix |
|---|---|---|
| 502 Bad Gateway | The backend isn't running, or the port in Nginx ≠ `PORT` in `.env` | `pm2 status`, `pm2 logs identee`; check both port numbers |
| The site loads but every action fails (console says "CORS") | `CORS_ORIGIN` missing or wrong | Set it in `.env` (with `https://`), `pm2 restart identee --update-env` |
| A page works from the menu but a reload shows 404 | Nginx's `try_files … /index.html` line missing | Check `/etc/nginx/sites-available/identee` |
| Photo upload fails with "413" | Nginx's upload limit | `client_max_body_size 25m;` in the site's Nginx file |
| `MongoDB` connection error in the logs | The server's IP isn't in Atlas Network Access | Add it (step 4d) |
| Invoice PDF fails | Chrome or its libraries missing | Steps 2b and 4b again, then `pm2 restart identee` |
| AI pictures fail after about a minute | Nginx timed out | `proxy_read_timeout 240s;` in the `/api/` part |
| Login codes don't arrive | Zoho settings, or they're in spam | `pm2 logs identee` for mail errors; check `EMAIL_*` in `.env` |

Useful commands: `pm2 status` · `pm2 logs identee` · `pm2 restart identee` · `sudo nginx -t` ·
`sudo systemctl reload nginx` · `sudo tail -50 /var/log/nginx/error.log`
