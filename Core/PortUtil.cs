using System.Net;
using System.Net.Sockets;

namespace StardewLocalAPI.Core
{
    internal static class PortUtil
    {
        public static int FindFreeLoopbackPort()
        {
            var l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }
    }
}