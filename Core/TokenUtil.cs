using System.Security.Cryptography;
using System.Text;

namespace StardewLocalAPI.Core
{
    internal static class TokenUtil
    {
        public static string GenerateToken(int length)
        {
            const string alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            byte[] bytes = RandomNumberGenerator.GetBytes(length);
            var sb = new StringBuilder(length);
            for (int i = 0; i < length; i++)
                sb.Append(alphabet[bytes[i] % alphabet.Length]);
            return sb.ToString();
        }
    }
}