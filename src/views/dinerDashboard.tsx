import React from "react";
import { Link } from "react-router-dom";
import { CloseIcon } from "../icons";
import Button from "../components/button";
import { HSOverlay } from "preline";
import View from "./view";
import { pizzaService } from "../service/service";
import { Order, OrderHistory, Role, User } from "../service/pizzaService";

interface Props {
  user: User | null;
  setUser: (user: User) => void;
}

export default function DinerDashboard(props: Props) {
  const user = props.user || ({} as User);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [updateError, setUpdateError] = React.useState("");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (async () => {
      if (user) {
        const r: OrderHistory = await pizzaService.getOrders(user);
        setOrders(r.orders);
      }
    })();
  }, [user]);

  function formatRole(role: { role: Role; objectId?: string }) {
    if (role.role === Role.Franchisee) {
      return `Franchisee on ${role.objectId}`;
    }

    return role.role;
  }

  function closeUpdateUser() {
    setTimeout(() => {
      HSOverlay.close(document.getElementById("hs-jwt-modal")!);
    }, 100);
  }

  function cancelUpdateUser() {
    if (passwordRef.current) passwordRef.current.value = "";
    setUpdateError("");
    closeUpdateUser();
  }

  async function updateUser() {
    setUpdateError("");
    setIsUpdating(true);
    const updatedUser: User = {
      ...user,
      name: nameRef.current?.value,
      email: emailRef.current?.value,
      password: passwordRef.current?.value || undefined,
    };
    try {
      const savedUser = await pizzaService.updateUser(updatedUser);
      if (nameRef.current) nameRef.current.value = savedUser.name || "";
      if (emailRef.current) emailRef.current.value = savedUser.email || "";
      if (passwordRef.current) passwordRef.current.value = "";
      props.setUser(savedUser);
      closeUpdateUser();
    } catch {
      setUpdateError("Unable to update your profile. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <View title="Your pizza kitchen">
      <div className="text-start py-8 px-4 sm:px-6 lg:px-8">
        <div className="hs-tooltip inline-block">
          <img
            className="hs-tooltip-toggle relative inline-block size-[96px] rounded-full ring-2 ring-white hover:z-10"
            src="https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=facearea&facepad=2&w=300&h=300&q=80"
            alt="Employee stock photo"
          />
        </div>
        <Button
          title="Edit"
          className="w-16 p-0"
          onPress={() =>
            HSOverlay.open(document.getElementById("hs-jwt-modal")!)
          }
        />

        <div className="my-4 text-lg text-orange-200 text-start grid grid-cols-5 gap-2">
          <div className="font-semibold text-orange-400">name:</div>{" "}
          <div className="col-span-4">{user.name}</div>
          <div className="font-semibold text-orange-400">email:</div>{" "}
          <div className="col-span-4">{user.email}</div>
          <div className="font-semibold text-orange-400">role:</div>{" "}
          <div className="col-span-4">
            {user.roles &&
              user.roles.map((role, index) => (
                <span key={index}>
                  {index === 0 ? "" : ", "} {formatRole(role)}
                </span>
              ))}
          </div>
        </div>

        {orders?.length === 0 && (
          <div className="text-neutral-100">
            How have you lived this long without having a pizza?{" "}
            <Link
              className="text-orange-400 underline font-semibold"
              to="/menu"
            >
              Buy one
            </Link>{" "}
            now!
          </div>
        )}
        {orders?.length > 0 && (
          <>
            <div className="text-neutral-100">
              Here is your history of all the good times.
            </div>
            <div className="bg-neutral-100 overflow-clip my-4">
              <div className="flex flex-col">
                <div className="-m-1.5 overflow-x-auto">
                  <div className="p-1.5 min-w-full inline-block align-middle">
                    <div className="overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="uppercase text-neutral-100 bg-slate-400 border-b-2 border-gray-500">
                          <tr>
                            <th
                              scope="col"
                              className="px-6 py-3 text-start text-xs sm:text-sm font-medium"
                            >
                              ID
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-start text-xs sm:text-sm font-medium"
                            >
                              Price
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-start text-xs sm:text-sm font-medium"
                            >
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {orders.map((order, index) => (
                            <tr key={index} className="hover:bg-gray-100">
                              <td className="px-6 py-4 whitespace-nowrap text-start text-xs sm:text-sm font-medium text-gray-800">
                                {order.id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-start text-xs sm:text-sm text-gray-800">
                                {order.items
                                  .reduce((a, c) => a + c.price, 0)
                                  .toLocaleString()}{" "}
                                ₿
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-start text-xs sm:text-sm text-gray-800">
                                {order.date.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        id="hs-jwt-modal"
        className="hs-overlay hidden size-full fixed top-10 start-0 z-[80] overflow-x-hidden overflow-y-auto pointer-events-none"
      >
        <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto min-h-[calc(100%-3.5rem)]">
          <div className="w-full flex flex-col bg-white border shadow-sm rounded-xl pointer-events-auto">
            <div className="flex justify-between items-center py-3 px-4 border-b bg-slate-200 rounded-t-xl">
              <h3 id="dialog-title" className="font-bold text-gray-800">
                Edit user
              </h3>
              <button
                type="button"
                aria-label="Close edit user dialog"
                className="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100"
                onClick={cancelUpdateUser}
              >
                <CloseIcon className="" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-5 gap-2 items-center text-start">
              {updateError && (
                <div role="alert" className="col-span-5 text-red-700">
                  {updateError}
                </div>
              )}
              <label
                htmlFor="update-name"
                className="font-semibold text-gray-800"
              >
                Name
              </label>
              <input
                id="update-name"
                type="text"
                defaultValue={user.name}
                ref={nameRef}
                className="col-span-4 border border-gray-300 rounded-md p-1"
              />
              <label
                htmlFor="update-email"
                className="font-semibold text-gray-800"
              >
                Email address
              </label>
              <input
                id="update-email"
                type="email"
                defaultValue={user.email}
                ref={emailRef}
                className="col-span-4 border border-gray-300 rounded-md p-1"
              />
              <label
                htmlFor="update-password"
                className="font-semibold text-gray-800"
              >
                Password
              </label>
              <input
                id="update-password"
                type="password"
                defaultValue=""
                ref={passwordRef}
                className="col-span-4 border border-gray-300 rounded-md p-1"
              />
            </div>
            <div className="flex justify-end items-center gap-x-2 py-3 px-4 border-t bg-slate-200 rounded-b-xl">
              <button
                type="button"
                className="py-2 px-3 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50"
                disabled={isUpdating}
                onClick={() => void updateUser()}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      </div>
    </View>
  );
}
