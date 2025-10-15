git clone -b v1.6 https://github.com/WCU-CS-CooperLab/autofeedback-s.git
cd autofeedback-s
git remote set-url origin https://github.com/wcupa2021classroom/autofeedback-s.git
git push -u origin v1.6


# 1. Make sure you are in your project folder
cd autofeedback-s

# 2. Set your new repo as the remote origin
git remote set-url origin https://github.com/wcupa2021classroom/autofeedback-s.git

# 3. Make sure you're on the master branch
git checkout master

# 4. Add all changes
git add .

# 5. Commit your changes
git commit -m "Initial copy of autofeedback-s v1.6"

# 6. Push to master branch on your repo
git push -u origin master




# 1. Create a new branch named 'main' from what you have now
git checkout -b main

# 2. Set your new repo as the remote (if not already)
git remote set-url origin https://github.com/wcupa2021classroom/autofeedback-s.git

# 3. Push the branch to GitHub
git push -u origin main
