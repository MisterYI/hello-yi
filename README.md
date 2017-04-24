Bravo! Now, you’re on the code view for your readme-edits branch, which is a copy of master. Let’s make some edits.# hello-yi
just practices
On GitHub, saved changes are called commits. Each commit has an associatedcommit message, which is a description explaining why a particular change was made. Commit messages capture 


#include <iostream>
int main()
{
	using namespace std;
	int currVal=0,val=0;
	if (cin >> currVal)
	{
		int cnt = 1;
		while (cin >> val)
		{
			if (val == currVal)
				++cnt;
			else
			{
				cout << currVal << " occurs " << cnt << " times" << endl;
				currVal = val;
				cnt = 1;
			}
		}
		 cout << currVal << " occurs " << cnt << " times" << endl;
	}
	system("pause");
	return 0;
}
